import { Injectable } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
type Aggregate = { count: number; sum: number; buckets: number[] }

/** HTTP-метрики Prometheus с малым числом меток; пути запросов и данные пользователей не попадают в метки. */
@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>()
  private readonly durations = new Map<string, Aggregate>()
  /** Сколько раз запросили слово, которого нет в большом словаре: рост значит битые адреса (тревога в Grafana). */
  private dictNotFound = 0

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint()
    res.once('finish', () => {
      const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER'
      const status = String(res.statusCode)
      if (res.statusCode === 404 && req.method === 'GET' && (req.originalUrl || '').startsWith('/api/dict/word/')) this.dictNotFound++
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
