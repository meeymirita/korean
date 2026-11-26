import { Injectable } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { logWarn } from './log.js'

const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
type Aggregate = { count: number; sum: number; buckets: number[] }

/** HTTP-метрики Prometheus с малым числом меток; пути запросов и данные пользователей не попадают в метки. */
@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>()
  private readonly durations = new Map<string, Aggregate>()
  /** Сколько раз запросили слово, которого нет в большом словаре: рост значит битые адреса (тревога в Grafana). */
  private dictNotFound = 0
  /** Какие именно слова не нашлись (слово → сколько раз): раз в 15 минут сводка уходит в журнал, чтобы по тревоге было видно, что ищут. */
  private readonly missingWords = new Map<string, number>()
  private lastMissingLog = Date.now()

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint()
    res.once('finish', () => {
      const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER'
      const status = String(res.statusCode)
      if (res.statusCode === 404 && req.method === 'GET' && (req.originalUrl || '').startsWith('/api/dict/word/')) this.noteMissing(req.originalUrl || '')
      const key = `${method}\u0000${status}`
      this.requests.set(key, (this.requests.get(key) || 0) + 1)
      const elapsed = Number(process.hrtime.bigint() - started) / 1e9
      const aggregate = this.durations.get(key) || { count: 0, sum: 0, buckets: BUCKETS.map(() => 0) }
      aggregate.count++
      aggregate.sum += elapsed
      BUCKETS.forEach((bucket, index) => { if (elapsed <= bucket) aggregate.buckets[index]++ })
      this.durations.set(key, aggregate)
    })
    next()
  }

  /** Считает ненайденное слово и раз в 15 минут пишет в журнал самые частые (без адресов и данных посетителей, слова из общего словаря). */
  private noteMissing(url: string) {
    this.dictNotFound++
    let word: string
    try {
      word = decodeURIComponent(url.slice('/api/dict/word/'.length).split('?')[0] ?? '')
    } catch {
      word = '(адрес не разобрать)'
    }
    word = word.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40)
    if (this.missingWords.size < 500 || this.missingWords.has(word)) this.missingWords.set(word, (this.missingWords.get(word) ?? 0) + 1)
    if (Date.now() - this.lastMissingLog < 15 * 60_000) return
    this.lastMissingLog = Date.now()
    const top = [...this.missingWords].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => `${w} ×${n}`).join(', ')
    this.missingWords.clear()
    logWarn('dict 404, чаще всего за 15 минут:', top)
  }

  render() {
    const lines = [
      '# HELP http_requests_total Количество завершённых HTTP-запросов.',
      '# TYPE http_requests_total counter',
    ]
    for (const [key, value] of this.requests) {
      const [method, status] = key.split('\u0000')
      lines.push(`http_requests_total{method="${method}",status="${status}"} ${value}`)
    }
    lines.push('# HELP http_request_duration_seconds Длительность HTTP-запросов в секундах.', '# TYPE http_request_duration_seconds histogram')
    for (const [key, aggregate] of this.durations) {
      const [method, status] = key.split('\u0000')
      const labels = `method="${method}",status="${status}"`
      BUCKETS.forEach((bucket, index) => lines.push(`http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${aggregate.buckets[index]}`))
      lines.push(`http_request_duration_seconds_bucket{${labels},le="+Inf"} ${aggregate.count}`)
      lines.push(`http_request_duration_seconds_sum{${labels}} ${aggregate.sum}`)
      lines.push(`http_request_duration_seconds_count{${labels}} ${aggregate.count}`)
    }
    lines.push('# HELP dict_word_not_found_total Запросы слов, которых нет в большом словаре.', '# TYPE dict_word_not_found_total counter', `dict_word_not_found_total ${this.dictNotFound}`)
    return `${lines.join('\n')}\n`
  }
}
