import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyWeeklyService, weeklySpec } from '../src/study/study-weekly.service'
import { renderWeeklyPdf, weekLabel } from '../src/study/weekly-pdf'

/** Воскресенье, 15 ноября 2026, 20:05 по часам сервера. */
const SUNDAY = new Date(2026, 10, 15, 20, 5)
const at = (day: number, h: number, m = 0, s = 0) => BigInt(new Date(2026, 10, day, h, m, s).getTime())
const ROWS = [
  { t: at(9, 10, 0, 0), ok: 1, mode: 'word', detail: '{"q":"학교","a":"школа","y":"школа"}' },
  { t: at(9, 10, 0, 30), ok: 0, mode: 'word', detail: '{"q":"물","a":"вода","y":"дом"}' },
  { t: at(9, 10, 1, 0), ok: 0, mode: 'word', detail: '{"q":"물","a":"вода","y":"стул"}' },
  { t: at(12, 19, 0, 0), ok: 1, mode: 'match', detail: '' },
  { t: at(15, 9, 0, 0), ok: 0, mode: 'match', detail: '' },
  // раньше недели: в отчёт не идёт
  { t: at(8, 23, 59, 0), ok: 1, mode: 'word', detail: '' },
]

function make() {
  const meta = new Map<string, string>()
  const db = {
    getMeta: vi.fn(async (k: string) => meta.get(k)),
    setMeta: vi.fn(async (k: string, v: string) => void meta.set(k, v)),
    orm: async () => ({
      answer: { findMany: async ({ where }: { where: { t: { gte: bigint; lt: bigint } } }) => ROWS.filter(r => r.t >= where.t.gte && r.t < where.t.lt) },
      studyTime: { findMany: async () => [{ day: '2026-11-09', seconds: 1500n }, { day: '2026-11-12', seconds: 600n }] },
    }),
  }
  const notify = { topicReady: vi.fn(() => true), sendFileToTopic: vi.fn(async () => undefined) }
  const svc = new StudyWeeklyService(db as never, notify as never)
  vi.spyOn(svc, 'banner').mockResolvedValue(undefined)
  return { svc, notify, meta }
}

afterEach(() => vi.unstubAllEnvs())

describe('недельный отчёт по занятиям', () => {
  it('данные листа: семь дней до сегодня, упражнения по числу ответов, повтор ошибки одной строкой', () => {
    const spec = weeklySpec(ROWS, { '2026-11-09': 1500 }, SUNDAY)
    expect(spec.days.map(d => d.day)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    expect(spec.days[0]).toEqual({ day: '2026-11-09', ok: 1, bad: 2, seconds: 1500 })
    expect(spec.modes).toEqual([
      { name: 'Слово → перевод', ok: 1, bad: 2, days: 1, seconds: 60 },
      { name: 'Найди пару', ok: 1, bad: 1, days: 2, seconds: 0 },
    ])
    expect(spec.mistakesTotal).toBe(3)
    expect(spec.mistakes).toEqual([{ mode: 'Слово → перевод', q: '물', a: 'вода', y: 'стул', n: 2 }])
    expect(weekLabel('2026-11-09', '2026-11-15')).toBe('9–15 ноября 2026 г.')
    expect(weekLabel('2026-10-30', '2026-11-05')).toBe('30 октября – 5 ноября 2026 г.')
  })

  it('в воскресенье после 20:00 PDF уходит в тему один раз, раньше и в другие дни молчит', async () => {
    const { svc, notify } = make()
    expect(await svc.weekly(new Date(2026, 10, 14, 21, 0))).toBe('off')
    expect(await svc.weekly(new Date(2026, 10, 15, 19, 59))).toBe('early')
    expect(await svc.weekly(SUNDAY)).toBe('sent')
    expect(await svc.weekly(new Date(2026, 10, 15, 20, 6))).toBe('already')
    expect(notify.sendFileToTopic).toHaveBeenCalledTimes(1)
    const [topic, name, pdf, caption, type] = notify.sendFileToTopic.mock.calls[0] as unknown as [string, string, Buffer, string, string]
    expect([topic, name, type]).toEqual(['study', 'nedelya-2026-11-09-2026-11-15.pdf', 'application/pdf'])
    expect(caption).toBe('💚 Отчёт за неделю\n9–15 ноября 2026 г.\n35 мин по таймеру · ответов: 5 · верных: 40% · ошибок: 3')
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(50_000)
  })

  it('день и время меняются в .env; тема не настроена: метка не ставится', async () => {
    const { svc, notify, meta } = make()
    vi.stubEnv('STUDY_WEEKDAY', '3')
    vi.stubEnv('STUDY_TIME', '9:30')
    expect(await svc.weekly(SUNDAY)).toBe('off')
    expect(await svc.weekly(new Date(2026, 10, 11, 9, 29))).toBe('early')
    notify.topicReady.mockReturnValueOnce(false)
    expect(await svc.weekly(new Date(2026, 10, 11, 9, 30))).toBe('off')
    expect(meta.size).toBe(0)
    expect(await svc.weekly(new Date(2026, 10, 11, 9, 30))).toBe('sent')
  })

  it('пустая неделя сама не уходит, по кнопке уходит; сбой Telegram не повторяется каждую минуту', async () => {
    const { svc, notify } = make()
    const later = new Date(2026, 11, 20, 20, 0)
    vi.spyOn(svc, 'spec').mockResolvedValueOnce(weeklySpec([], {}, later))
    expect(await svc.weekly(later)).toBe('empty')
    expect(notify.sendFileToTopic).not.toHaveBeenCalled()
    vi.spyOn(svc, 'spec').mockResolvedValueOnce(weeklySpec([], {}, later))
    expect(await svc.send(later, true)).toBe(true)
    const second = make()
    second.notify.sendFileToTopic.mockRejectedValueOnce(new Error('Telegram 500'))
    expect(await second.svc.weekly(SUNDAY)).toBe('failed')
    expect(await second.svc.weekly(new Date(2026, 10, 15, 20, 6))).toBe('already')
  })

  it('лист рисуется с картинкой шапки и без неё; файл для просмотра по WEEKLY_PDF_OUT', async () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-${String(9 + i).padStart(2, '0')}`, ok: [40, 0, 62, 25, 80, 12, 55][i]!, bad: [9, 0, 14, 3, 21, 6, 8][i]!, seconds: [1500, 0, 2400, 900, 3300, 600, 2100][i]! }))
    const modes = ['Слово → перевод', 'Частицы и счёт', 'Найди пару', 'Напиши перевод', 'Перевод → слово', 'Только (만)', 'Собери по слогам', 'Числа', 'Повторение: карточки', 'Мои ошибки', 'Пара или нет', 'Выбери форму'].map((name, i) => ({ name, ok: 60 - i * 4, bad: 2 + (i % 5) * 3, days: 7 - (i % 6), seconds: 2400 - i * 170 }))
    const mistakes = Array.from({ length: 30 }, (_, i) => ({ mode: modes[i % 6]!.name, q: ['친구__ 만나요', '물', '저는 학교__ 가요', '선생님', '집__ 쉬어요'][i % 5]!, a: ['를', 'вода', '에', 'учитель', '에서'][i % 5]!, y: ['가', 'дом', '에서', 'студент', '에'][i % 5]!, n: Math.max(1, 5 - Math.floor(i / 4)) }))
    const spec = { days, modes, mistakes, mistakesTotal: 61, made: '15 ноября 2026 г., 20:00' }
    const plain = await renderWeeklyPdf(spec)
    expect(plain.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const banner = readFileSync(path.join(__dirname, '../../frontend/public/tg/tg-study.png'))
    const pdf = await renderWeeklyPdf({ ...spec, banner })
    expect(pdf.length).toBeGreaterThan(plain.length)
    expect(pdf.subarray(-6).toString('latin1')).toBe('%%EOF\n')
    const out = process.env.WEEKLY_PDF_OUT || path.join(mkdtempSync(path.join(tmpdir(), 'weekly-')), 'nedelya.pdf')
    writeFileSync(out, pdf)
  })
})
