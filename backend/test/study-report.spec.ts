import { describe, expect, it, vi } from 'vitest'
import { NotifyController } from '../src/notify/notify.controller'

/** Приём PDF отчёта о занятии: POST /api/notify/study-report. */
function make(ready = true) {
  const notify = { topicReady: vi.fn(() => ready), sendFileToTopic: vi.fn(async () => undefined) }
  return { notify, c: new NotifyController(notify as never, {} as never) }
}
const pdf = (text = '%PDF-1.4 лист') => ({ buffer: Buffer.from(text) }) as Express.Multer.File

describe('отчёт о занятии: приём файла', () => {
  it('PDF уходит в тему «Отчёт по занятиям» с именем по времени начала и подписью-итогом', async () => {
    const { c, notify } = make()
    const r = await c.studyReport(pdf(), { when: '12 ноября 2026 г. · 19:02–19:54', stamp: '2026-11-12-19-02', seconds: '2980', answers: '206', ok: '159' })
    expect(r).toEqual({ ok: true, message: '' })
    expect(notify.sendFileToTopic).toHaveBeenCalledWith(
      'study',
      'zanyatie-2026-11-12-19-02.pdf',
      expect.any(Buffer),
      '💚 Отчёт о занятии\n12 ноября 2026 г. · 19:02–19:54\n50 мин по таймеру · ответов: 206 · верных: 77% · ошибок: 47',
      'application/pdf',
    )
  })

  it('тема не настроена: сайт получает skipped и молчит, файл никуда не идёт', async () => {
    const { c, notify } = make(false)
    expect(await c.studyReport(pdf(), {})).toMatchObject({ ok: false, skipped: true })
    expect(notify.sendFileToTopic).not.toHaveBeenCalled()
  })

  it('не PDF и пустой запрос отклоняются, чужое имя файла не подставляется', async () => {
    const { c, notify } = make()
    expect(await c.studyReport(undefined, {})).toMatchObject({ ok: false, message: 'нужен PDF-файл отчёта' })
    expect(await c.studyReport(pdf('<html>'), {})).toMatchObject({ ok: false })
    await c.studyReport(pdf(), { stamp: '../../etc', answers: '3', ok: '9' })
    const [, name, , caption] = notify.sendFileToTopic.mock.calls[0] as unknown as string[]
    expect(name).toMatch(/^zanyatie-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.pdf$/)
    expect(caption).toContain('верных: 100%')
  })

  it('Telegram не принял: ошибка возвращается текстом', async () => {
    const { c, notify } = make()
    notify.sendFileToTopic.mockRejectedValueOnce(new Error('Telegram 400: файл слишком большой'))
    expect(await c.studyReport(pdf(), {})).toEqual({ ok: false, message: 'Telegram 400: файл слишком большой' })
  })
})
