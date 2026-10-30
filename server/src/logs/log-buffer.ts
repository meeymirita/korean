/**
 * Журнал сервера в памяти: всё, что процесс пишет в stdout и stderr (в том числе ошибки Nest и падения), копится в кольцевом буфере
 * и показывается в кабинете. Служба systemd по-прежнему получает те же строки в journalctl: буфер только подслушивает.
 */
export interface LogLine {
  t: number
  level: 'info' | 'warn' | 'error'
  msg: string
}

const MAX_LINES = 2000
const ANSI = /\u001b\[[0-9;]*m/g
const lines: LogLine[] = []
let started = false

const levelOf = (text: string, stream: 'out' | 'err'): LogLine['level'] => {
  if (/\b(ERROR|FATAL)\b|Unhandled|Error:|ошибк/i.test(text)) return 'error'
  if (/\bWARN\b|ВНИМАНИЕ|warn/i.test(text)) return 'warn'
  return stream === 'err' ? 'warn' : 'info'
}

export function push(text: string, stream: 'out' | 'err' = 'out') {
  for (const raw of text.replace(ANSI, '').split(/\r?\n/)) {
    const msg = raw.trim()
    if (!msg) continue
    lines.push({ t: Date.now(), level: levelOf(msg, stream), msg: msg.slice(0, 2000) })
  }
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
}

/** Включает подслушивание stdout и stderr и перехват необработанных ошибок. Повторный вызов ничего не делает. */
export function startLogCapture() {
  if (started) return
  started = true
  for (const [stream, name] of [[process.stdout, 'out'], [process.stderr, 'err']] as const) {
    const original = stream.write.bind(stream) as (chunk: unknown, ...rest: unknown[]) => boolean
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      try {
        push(typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk), name)
      } catch {
        /* журнал не должен ломать вывод */
      }
      return original(chunk, ...rest)
    }) as typeof stream.write
  }
  process.on('uncaughtException', e => push(`Необработанная ошибка: ${e?.stack ?? e}`, 'err'))
  process.on('unhandledRejection', e => push(`Необработанный отказ: ${(e as Error)?.stack ?? e}`, 'err'))
}

/** Последние строки, новые снизу; фильтр по уровню и подстроке. */
export function recent(limit: number, level?: string, q?: string): LogLine[] {
  const needle = q?.trim().toLowerCase()
  const out = lines.filter(l => (!level || l.level === level) && (!needle || l.msg.toLowerCase().includes(needle)))
  return out.slice(-limit)
}
