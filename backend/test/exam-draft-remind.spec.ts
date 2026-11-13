import { describe, expect, it, vi } from 'vitest'
import { DRAFT_REMIND_MS, draftRemind, draftTouchedAt } from '../src/exams/draft-remind'
import { DAY_MS, ExamsService } from '../src/exams/exams.service'

const T0 = Date.UTC(2026, 10, 1, 9, 0, 0)
const draft = (o: Record<string, unknown> = {}) => ({ v: 1, startedAt: T0, results: [[{ ok: true }], null, null, null], ...o })

describe('напоминание о черновике экзамена: пора ли', () => {
  it('через 3 суток после последнего сохранения; раньше нет', () => {
    expect(draftRemind(draft(), T0 + DRAFT_REMIND_MS - 1)).toBeNull()
    expect(draftRemind(draft(), T0 + DRAFT_REMIND_MS)).toEqual({ saved: 1, parts: 4 })
  })
  it('savedAt важнее startedAt, старый черновик считается по startedAt', () => {
    expect(draftTouchedAt(draft({ savedAt: T0 + DAY_MS }))).toBe(T0 + DAY_MS)
    expect(draftTouchedAt(draft())).toBe(T0)
    expect(draftRemind(draft({ savedAt: T0 + 2 * DAY_MS }), T0 + 4 * DAY_MS)).toBeNull()
  })
  it('нет черновика, нет времени, нет частей или все сохранены: не напоминает', () => {
    const late = T0 + 10 * DAY_MS
    for (const d of [null, undefined, 'x', [], {}, draft({ results: [] }), draft({ results: [null, null] }), draft({ results: [[1], [2]] })]) expect(draftRemind(d, late)).toBeNull()
  })
  it('экзамен сдан после начала черновика: не напоминает; новая попытка после сдачи: напоминает', () => {
    const late = T0 + 10 * DAY_MS
    expect(draftRemind(draft(), late, T0 + DAY_MS)).toBeNull()
    expect(draftRemind(draft({ startedAt: T0 + 2 * DAY_MS }), late, T0 + DAY_MS)).toEqual({ saved: 1, parts: 4 })
  })
})

function make() {
  const meta = new Map<string, string>()
  const db = { getMeta: async (k: string) => meta.get(k), setMeta: async (k: string, v: string) => void meta.set(k, v) }
  const notify = { send: vi.fn(async () => undefined) }
  return { svc: new ExamsService(db as never, notify as never), notify }
}

describe('напоминание о черновике: сервис (без базы)', () => {
  it('сохранение ставит savedAt; одно сообщение в день', async () => {
    const { svc, notify } = make()
    await svc.saveDraft(draft(), T0)
    expect(((await svc.draft()).draft as { savedAt: number }).savedAt).toBe(T0)
    const day = new Date(T0 + 4 * DAY_MS)
    day.setHours(13, 0, 0, 0)
    expect(await svc.remind(day)).toBe('sent')
    expect(await svc.remind(day)).toBe('already')
    expect(notify.send).toHaveBeenCalledTimes(1)
    expect((notify.send.mock.calls[0] as unknown[])[0]).toMatchObject({ text: expect.stringContaining('часть 1 из 4 сохранена') })
  })
  it('свежий черновик или сданный экзамен: none', async () => {
    const { svc } = make()
    await svc.saveDraft(draft(), T0)
    const soon = new Date(T0 + DAY_MS)
    soon.setHours(13, 0, 0, 0)
    expect(await svc.remind(soon)).toBe('none')
    await svc.submit({ id: 'final', title: 'Итог', right: 90, total: 100 }, T0 + 2 * DAY_MS)
    const late = new Date(T0 + 5 * DAY_MS)
    late.setHours(13, 0, 0, 0)
    expect(await svc.remind(late)).toBe('none')
  })
})
