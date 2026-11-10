import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Public } from './auth/auth.js'
import { Events } from './events/events.service.js'

/** Не больше стольких записей в час: адрес открытый, журнал событий им забить нельзя. */
const PER_HOUR = 20
const text = (v: unknown) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, 80) : '')

/** Что нарушено в отчёте браузера: «директива, что заблокировано, на какой странице». Понимает оба вида отчётов (report-uri и report-to). */
export function cspReportLine(body: unknown): string {
  const first = Array.isArray(body) ? body[0] : body
  const wrap = (first ?? {}) as Record<string, unknown>
  const r = (wrap['csp-report'] ?? wrap.body ?? wrap) as Record<string, unknown>
  const directive = text(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'])
  const blocked = text(r['blocked-uri'] ?? r.blockedURL)
  let page = text(r['document-uri'] ?? r.documentURL)
  try {
    page = new URL(page).pathname.slice(0, 60)
  } catch {
    /* адрес страницы не разобрался: оставляем как есть */
  }
  return directive ? `${directive}: ${blocked || 'inline'} на ${page || '?'}` : ''
}

/**
 * Отчёты браузера о нарушении Content-Security-Policy сайта (frontend/src/nitro/plugins/csp.ts). Открыт всем: его шлёт сам браузер.
 * В журнал событий попадает одна строка на каждое новое нарушение, повторы и лишнее отбрасываются.
 */
@Controller('csp-report')
export class CspReportController {
  constructor(private readonly events: Events) {}

  private window = { at: 0, n: 0 }
  private readonly seen = new Set<string>()

  @Public()
  @HttpCode(204)
  @Post()
  async report(@Body() body: unknown, now = Date.now()) {
    const line = cspReportLine(body)
    if (!line) return
    if (now - this.window.at > 3_600_000) {
      this.window = { at: now, n: 0 }
      this.seen.clear()
    }
    if (this.seen.has(line) || ++this.window.n > PER_HOUR) return
    this.seen.add(line)
    await this.events.log('csp', line).catch(() => undefined)
  }
}
