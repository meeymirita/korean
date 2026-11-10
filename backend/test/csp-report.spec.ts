import { describe, expect, it, vi } from 'vitest'
import { CspReportController, cspReportLine } from '../src/csp-report.controller'

const report = (directive: string, blocked: string, page = 'https://korean.meeymirita.ru/korean/words?x=1') => ({
  'csp-report': { 'effective-directive': directive, 'blocked-uri': blocked, 'document-uri': page },
})

describe('отчёты о нарушении CSP', () => {
  it('из отчёта берётся директива, заблокированный адрес и путь страницы без параметров', () => {
    expect(cspReportLine(report('script-src-elem', 'https://evil.example/x.js'))).toBe('script-src-elem: https://evil.example/x.js на /korean/words')
    expect(cspReportLine([{ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'https://a.b/c.png', documentURL: 'https://korean.meeymirita.ru/' } }])).toBe('img-src: https://a.b/c.png на /')
    expect(cspReportLine(report('script-src', ''))).toBe('script-src: inline на /korean/words')
    expect(cspReportLine(null)).toBe('')
    expect(cspReportLine({ foo: 1 })).toBe('')
    expect(cspReportLine('строка')).toBe('')
  })

  it('в журнал идёт одна строка на новое нарушение, не больше 20 в час', async () => {
    const events = { log: vi.fn(async () => undefined) }
    const c = new CspReportController(events as never)
    const now = Date.UTC(2026, 10, 10, 12)
    await c.report(report('script-src', 'https://a.example/1.js'), now)
    await c.report(report('script-src', 'https://a.example/1.js'), now)
    expect(events.log).toHaveBeenCalledOnce()
    expect(events.log).toHaveBeenCalledWith('csp', 'script-src: https://a.example/1.js на /korean/words')
    for (let i = 0; i < 40; i++) await c.report(report('img-src', `https://a.example/${i}.png`), now)
    expect(events.log).toHaveBeenCalledTimes(20)
    await c.report({}, now)
    expect(events.log).toHaveBeenCalledTimes(20)
    await c.report(report('img-src', 'https://a.example/new.png'), now + 3_700_000)
    expect(events.log).toHaveBeenCalledTimes(21)
  })
})
