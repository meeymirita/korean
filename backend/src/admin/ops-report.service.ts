import { Injectable } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from '../config.js'
import { Db } from '../db/db.service.js'
import { OpsService } from './ops.service.js'

const PROMETHEUS = (process.env.PROMETHEUS_URL || 'http://prometheus:9090').replace(/\/$/, '')
/** Настоящие ошибки и предупреждения: уровень в журнале (ERROR, WARN, level=error) или явные слова; обычные строки INFO и «0 failed tasks» не считаются. */
const BAD_LINE = /\b(ERROR|FATAL|WARN(ING)?)\b|level=(error|warn)|unhandled|exception|ошибк|не удал|timed? ?out|connection refused|permission denied/i
const NOT_BAD = /level=info|\bINFO\b(?!.*\b(ERROR|FATAL)\b)|\b0 failed\b/i
/** Секреты в отчёт попасть не должны: длинные случайные строки и пары «ключ=значение» с паролями заменяются. */
const SECRET = /((?:token|passw\w*|secret|key|authorization|bearer)\W{0,3})([A-Za-z0-9+/_=-]{12,})/gi

export const hide = (text: string) => text.replace(SECRET, '$1***').replace(/[0-9a-f]{40,}/gi, '***')

/** Отчёт о состоянии для владельца: одним markdown-файлом, который можно переслать (например, Claude) и по нему понять, что и где не работало. */
@Injectable()
export class OpsReportService {
  constructor(
    private readonly db: Db,
    private readonly ops: OpsService,
  ) {}

  private async query(expr: string): Promise<number | null> {
    try {
      const r = await fetch(`${PROMETHEUS}/api/v1/query?${new URLSearchParams({ query: expr })}`, { signal: AbortSignal.timeout(4000) })
      const j = await r.json() as { data?: { result?: { value?: [number, string] }[] } }
      const v = j.data?.result?.[0]?.value?.[1]
      return v === undefined ? null : Number(v)
    } catch {
      return null
    }
  }

  async build(viaProxy: boolean) {
    const out: string[] = []
    const now = new Date()
    out.push(`# Отчёт о состоянии 우리말`, '', `Собран: ${now.toISOString()} (${now.toLocaleString('ru-RU', { timeZone: 'Asia/Novosibirsk' })} по Новосибирску)`, `Версия Node: ${process.version}, сервер работает ${Math.round(process.uptime() / 60)} мин`, '')

    // службы
    out.push('## Службы')
    let services: Awaited<ReturnType<OpsService['services']>>['services'] = []
    try {
      services = (await this.ops.services(viaProxy)).services
      out.push('| Служба | Состояние | Здоровье | Подробности |', '|---|---|---|---|')
      for (const s of services) out.push(`| ${s.name} | ${s.state} | ${s.health} | ${s.status} |`)
      const bad = services.filter(s => s.state !== 'running' && s.state !== 'unknown' && s.name !== 'caddy' || s.health === 'unhealthy')
      out.push('', bad.length ? `**Проблемные службы:** ${bad.map(s => s.name).join(', ')}` : 'Все службы работают.')
    } catch (e) {
      out.push(`Не удалось получить состояние Docker: ${(e as Error).message}`)
    }

    // нагрузка и сайт (Prometheus)
    out.push('', '## Нагрузка и сайт')
    const metric = async (label: string, expr: string, fmt: (v: number) => string) => {
      const v = await this.query(expr)
      out.push(`- ${label}: ${v === null || Number.isNaN(v) ? 'нет данных' : fmt(v)}`)
    }
    await metric('Процессор занят', '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))', v => `${v.toFixed(0)}%`)
    await metric('Память занята', '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)', v => `${v.toFixed(0)}%`)
    await metric('Самый заполненный диск', 'max(100 * (1 - node_filesystem_avail_bytes{fstype=~"ext4|xfs|btrfs|zfs|apfs"} / node_filesystem_size_bytes{fstype=~"ext4|xfs|btrfs|zfs|apfs"}))', v => `${v.toFixed(0)}%`)
    await metric('Нагрузка (load average, 5 мин)', 'node_load5', v => v.toFixed(2))
    await metric('Обращений к сайту в минуту', 'sum(rate(http_requests_total[5m])) * 60', v => v.toFixed(1))
    await metric('Ответов с ошибкой запроса (4xx) за час', 'sum(increase(http_requests_total{status=~"4.."}[1h]))', v => v.toFixed(0))
    await metric('Сбоев сервера (5xx) за час', 'sum(increase(http_requests_total{status=~"5.."}[1h]))', v => v.toFixed(0))
    await metric('Медленные ответы (p95)', 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))', v => `${(v * 1000).toFixed(0)} мс`)
    for (const s of services.filter(x => x.state === 'running' && x.name !== 'caddy-host')) {
      const cpu = await this.query(`service_cpu_percent{service="${s.name}"}`)
      const mem = await this.query(`service_memory_bytes{service="${s.name}"}`)
      if (cpu !== null || mem !== null) out.push(`  - ${s.name}: процессор ${cpu?.toFixed(1) ?? '?'}%, память ${mem === null ? '?' : Math.round(mem / 1048576) + ' МБ'}`)
    }

    // копии
    out.push('', '## Резервные копии')
    try {
      const b = JSON.parse(readFileSync(path.join(DATA_DIR, 'backup-status.json'), 'utf8')) as { ok?: boolean; time?: number; sizeKb?: number; message?: string }
      out.push(`- Ночная копия: ${b.ok ? 'удалась' : 'НЕ УДАЛАСЬ'}, ${b.time ? new Date(b.time).toISOString() : 'время неизвестно'}, ${b.sizeKb ? Math.round(b.sizeKb / 1024) + ' МБ' : ''} ${b.message ?? ''}`.trim())
    } catch {
      out.push('- Файла статуса копии нет (копия ещё не запускалась).')
    }

    // события безопасности
    out.push('', '## Последние события входа и защиты')
    try {
      const rows = await (await this.db.orm()).event.findMany({ orderBy: { id: 'desc' }, take: 25 })
      if (!rows.length) out.push('Событий нет.')
      for (const r of rows) out.push(`- ${new Date(Number(r.t)).toISOString()} ${r.type}${r.info ? ': ' + hide(r.info) : ''}`)
    } catch (e) {
      out.push(`Не удалось прочитать события: ${(e as Error).message}`)
    }

    // ошибки в журналах
    out.push('', '## Ошибки и предупреждения в журналах служб (последние строки)')
    let any = false
    for (const s of services.filter(x => x.state === 'running' && x.name !== 'caddy-host')) {
      try {
        const { logs } = await this.ops.logs(s.name, 300)
        const lines = logs.split('\n').filter(l => BAD_LINE.test(l) && !NOT_BAD.test(l)).slice(-12)
        if (!lines.length) continue
        any = true
        out.push('', `### ${s.name}`, '```', ...lines.map(l => hide(l).slice(0, 300)), '```')
      } catch { /* журнал этой службы недоступен */ }
    }
    if (!any) out.push('Ошибок в последних строках журналов нет.')
    out.push('', '---', 'Отчёт не содержит паролей и токенов (длинные ключи заменены на ***). Пришли его целиком, если нужно разобраться, что и где не работает.')
    return out.join('\n') + '\n'
  }
}
