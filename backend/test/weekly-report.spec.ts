import { describe, expect, it, vi } from 'vitest'
import { OpsReportService } from '../src/admin/ops-report.service.js'

function make() {
  const meta = new Map<string, string>()
  const db = { getMeta: async (k: string) => meta.get(k), setMeta: async (k: string, v: string) => void meta.set(k, v) }
  const notify = { sendFileToTopic: vi.fn(async () => undefined) }
  const svc = new OpsReportService(db as never, {} as never, notify as never)
  vi.spyOn(svc, 'build').mockResolvedValue('# Отчёт')
  return { svc, notify, meta }
}
const at = (iso: string) => new Date(iso)

describe('недельный отчёт в «Тревоги»', () => {
  it('по умолчанию понедельник 21:00: до срока и в другой день молчит, потом один раз за день', async () => {
    const { svc, notify } = make()
    expect(await svc.weekly(at('2026-11-10T21:30:00'))).toBe('off') // вторник
    expect(await svc.weekly(at('2026-11-09T20:59:00'))).toBe('early')
    expect(await svc.weekly(at('2026-11-09T21:00:00'))).toBe('sent')
    expect(await svc.weekly(at('2026-11-09T21:05:00'))).toBe('already')
    expect(notify.sendFileToTopic).toHaveBeenCalledTimes(1)
    expect(notify.sendFileToTopic).toHaveBeenCalledWith('alert', 'otchet-2026-11-09-21-00.md', '# Отчёт', expect.stringContaining('Недельный отчёт'))
    expect(await svc.weekly(at('2026-11-16T21:00:00'))).toBe('sent') // следующая неделя
  })

  it('REPORT_WEEKDAY и REPORT_TIME меняют срок; сбой Telegram не повторяется в тот же день', async () => {
    process.env.REPORT_WEEKDAY = '0'
    process.env.REPORT_TIME = '9:30'
    try {
      const { svc, notify } = make()
      notify.sendFileToTopic.mockRejectedValueOnce(new Error('нет темы'))
      expect(await svc.weekly(at('2026-11-08T09:29:00'))).toBe('early')
      expect(await svc.weekly(at('2026-11-08T09:30:00'))).toBe('failed')
      expect(await svc.weekly(at('2026-11-08T10:00:00'))).toBe('already')
    } finally {
      delete process.env.REPORT_WEEKDAY
      delete process.env.REPORT_TIME
    }
  })
})
