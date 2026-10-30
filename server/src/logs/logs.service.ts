/** Журналы для кабинета: сервер (Node) из памяти процесса и Caddy из файла журнала доступа (путь в CADDY_LOG_FILE). */
import { Injectable } from '@nestjs/common'
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs'
import { recent, type LogLine } from './log-buffer'

const MAX_LIMIT = 500
const TAIL_BYTES = 512 * 1024

/** Читает конец файла, не загружая его целиком (журнал Caddy может быть большим). */
function tail(file: string): string {
  const fd = openSync(file, 'r')
  try {
    const size = fstatSync(fd).size
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const text = buf.toString('utf8')
    return size > len ? text.slice(text.indexOf('\n') + 1) : text // первая строка могла оборваться
  } finally {
    closeSync(fd)
  }
}

/** Строка журнала доступа Caddy (JSON) в читаемый вид; не JSON остаётся как есть. */
export function caddyLine(raw: string): LogLine | null {
  const line = raw.trim()
  if (!line) return null
  try {
    const j = JSON.parse(line) as { ts?: number; level?: string; msg?: string; status?: number; duration?: number; size?: number; request?: { remote_ip?: string; client_ip?: string; method?: string; host?: string; uri?: string }; err?: string }
    const t = typeof j.ts === 'number' ? Math.round(j.ts * 1000) : Date.now()
    if (j.request && typeof j.status === 'number') {
      const r = j.request
      const ms = typeof j.duration === 'number' ? ` · ${Math.round(j.duration * 1000)} мс` : ''
      return { t, level: j.status >= 500 ? 'error' : j.status >= 400 ? 'warn' : 'info', msg: `${j.status} ${r.method ?? ''} ${r.host ?? ''}${r.uri ?? ''} · ${r.client_ip || r.remote_ip || ''}${ms}`.replace(/\s+/g, ' ').slice(0, 1000) }
    }
    const level = j.level === 'error' || j.level === 'fatal' || j.level === 'panic' ? 'error' : j.level === 'warn' ? 'warn' : 'info'
    return { t, level, msg: `${j.msg ?? line}${j.err ? ': ' + j.err : ''}`.slice(0, 1000) }
  } catch {
    return { t: Date.now(), level: /error/i.test(line) ? 'error' : 'info', msg: line.slice(0, 1000) }
  }
}

@Injectable()
export class LogsService {
  private clamp(limit: unknown) {
    return Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit)) || 200))
  }

  /** Сервер: что процесс писал с последнего запуска (в памяти, до 2000 строк). */
  app(limit?: unknown, level?: unknown, q?: unknown) {
    return { source: 'app', configured: true, lines: recent(this.clamp(limit), typeof level === 'string' ? level : undefined, typeof q === 'string' ? q : undefined) }
  }

  /** Caddy: журнал доступа из файла, путь задаётся CADDY_LOG_FILE в server/.env. */
  caddy(limit?: unknown, level?: unknown, q?: unknown) {
    const file = process.env.CADDY_LOG_FILE
    if (!file) return { source: 'caddy', configured: false, reason: 'not set', lines: [] as LogLine[] }
    if (!existsSync(file)) return { source: 'caddy', configured: false, reason: 'missing', lines: [] as LogLine[] }
    let text: string
    try {
      text = tail(file)
    } catch {
      return { source: 'caddy', configured: false, reason: 'denied', lines: [] as LogLine[] }
    }
    const needle = typeof q === 'string' ? q.trim().toLowerCase() : ''
    const lv = typeof level === 'string' ? level : ''
    const lines = text
      .split('\n')
      .map(caddyLine)
      .filter((l): l is LogLine => !!l && (!lv || l.level === lv) && (!needle || l.msg.toLowerCase().includes(needle)))
    return { source: 'caddy', configured: true, lines: lines.slice(-this.clamp(limit)) }
  }
}
