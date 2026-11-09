import { describe, expect, it, vi } from 'vitest'
import { DAY_MS, ExamsService, cleanRules } from '../src/exams/exams.service'

function make() {
  const meta = new Map<string, string>()
  const db = { getMeta: async (k: string) => meta.get(k), setMeta: async (k: string, v: string) => void meta.set(k, v) }
  const notify = { send: vi.fn(async () => undefined) }
  return { svc: new ExamsService(db as never, notify as never), notify }
}
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0)

describe('итоговая оценка', () => {
  it('сдал с 85%: подтвердить через 30 дней, пересдача не раньше суток', async () => {
    const { svc } = make()
    const r = await svc.submit({ id: 'eun', title: '은 / 는', right: 11, total: 12 }, T0)
    expect(r.passed).toBe(true)
    expect(r.dueAt).toBe(T0 + 30 * DAY_MS)
    await expect(svc.submit({ id: 'eun', title: '은 / 는', right: 12, total: 12 }, T0 + 3600_000)).rejects.toMatchObject({ status: 429 })
    const again = await svc.submit({ id: 'eun', title: '은 / 는', right: 9, total: 12 }, T0 + DAY_MS)
    expect(again).toMatchObject({ passed: false, tries: 2, dueAt: null })
    expect(again.best).toBeCloseTo(11 / 12)
  })

  it('разбор попытки: ошибки сохраняются, чистятся, хранятся последние 10, новые первыми', async () => {
    const { svc } = make()
    const mistakes = [{ b: 'Найди ошибки', q: '저는 학생이에요.', y: 'Ошибка', a: 'Верно', extra: 'x' }, { q: '', a: 'пусто' }, 'мусор']
    await svc.submit({ id: 'eun', title: '은 / 는', right: 40, total: 56, mistakes }, T0)
    const first = (await svc.log('eun')).attempts[0]!
    expect(first).toMatchObject({ right: 40, total: 56, passed: false })
    expect(first.mistakes).toEqual([{ b: 'Найди ошибки', q: '저는 학생이에요.', y: 'Ошибка', a: 'Верно' }])
    for (let i = 1; i <= 12; i++) await svc.submit({ id: 'eun', title: '은 / 는', right: i, total: 56 }, T0 + i * 2 * DAY_MS)
    const all = (await svc.log('eun')).attempts
    expect(all).toHaveLength(10)
    expect(all[0]!.right).toBe(12)
    expect((await svc.log('нет')).attempts).toEqual([])
  })


  it('критерий: 85% всего и не меньше 70% по каждому правилу; разбивка по правилам сохраняется', async () => {
    const { svc } = make()
    // 90% всего, но одно правило только 50%: не сдано
    const weak = { eun: { ok: 18, total: 18 }, iga: { ok: 9, total: 10 }, only: { ok: 1, total: 2 } }
    const r1 = await svc.submit({ id: 'final', title: 'Итоговая оценка', right: 28, total: 30, rules: weak }, T0)
    expect(r1.passed).toBe(false)
    expect(r1.rules.only).toEqual({ ok: 1, total: 2 })
    // все правила от 70% и 85% всего: сдано
    const ok = { eun: { ok: 18, total: 18 }, iga: { ok: 9, total: 10 }, only: { ok: 2, total: 2 } }
    const r2 = await svc.submit({ id: 'final', title: 'Итоговая оценка', right: 29, total: 30, rules: ok }, T0 + DAY_MS)
    expect(r2.passed).toBe(true)
    expect(r2.dueAt).toBe(T0 + DAY_MS + 30 * 86_400_000)
    // 80% всего: не сдано, даже если каждое правило выше 70%
    const r3 = await svc.submit({ id: 'final', title: 'Итоговая оценка', right: 24, total: 30, rules: { eun: { ok: 12, total: 15 }, iga: { ok: 12, total: 15 } } }, T0 + 3 * DAY_MS)
    expect(r3.passed).toBe(false)
  })

  it('разбивка по правилам чистится: только числа, правдоподобные значения', () => {
    expect(cleanRules({ eun: { ok: 3, total: 4 }, 'плохой ключ!': { ok: 1, total: 1 }, x: { ok: 5, total: 2 }, y: { ok: '1', total: 2 }, z: 7 })).toEqual({ eun: { ok: 3, total: 4 } })
    expect(cleanRules(null)).toEqual({})
    expect(cleanRules([])).toEqual({})
  })

  it('черновик экзамена хранится между частями; слишком большой или не объект отклоняется', async () => {
    const { svc } = make()
    expect((await svc.draft()).draft).toBeNull()
    await svc.saveDraft({ v: 1, parts: [[1], [2]], results: [[{ rule: 'eun', ok: true }], null] })
    expect(((await svc.draft()).draft as { results: unknown[] }).results).toHaveLength(2)
    await expect(svc.saveDraft('строка')).rejects.toMatchObject({ status: 400 })
    await expect(svc.saveDraft([1])).rejects.toMatchObject({ status: 400 })
    await expect(svc.saveDraft({ big: 'x'.repeat(700_000) })).rejects.toMatchObject({ status: 400 })
    await svc.dropDraft()
    expect((await svc.draft()).draft).toBeNull()
  })

  it('неверные данные отклоняются', async () => {
    const { svc } = make()
    for (const bad of [{}, { id: 'x y', title: 't', right: 1, total: 2 }, { id: 'a', title: '', right: 1, total: 2 }, { id: 'a', title: 't', right: 3, total: 2 }, { id: 'a', title: 't', right: 1.5, total: 2 }]) {
      await expect(svc.submit(bad as never, T0)).rejects.toMatchObject({ status: 400 })
    }
  })

  it('напоминание: не сдал (через сутки) и подошёл срок подтверждения; раз в день, после 12:00', async () => {
    const { svc, notify } = make()
    await svc.submit({ id: 'eun', title: '은 / 는', right: 5, total: 12 }, T0)
    await svc.submit({ id: 'iga', title: '이 / 가', right: 12, total: 12 }, T0)
    expect(svc.due((await svc.list()).results, T0 + 3 * 3600_000)).toEqual([]) // сутки ещё не прошли
    const d1 = new Date(T0 + 2 * DAY_MS)
    d1.setHours(11, 0, 0, 0)
    expect(await svc.remind(d1)).toBe('early')
    d1.setHours(13, 0, 0, 0)
    expect(await svc.remind(d1)).toBe('sent')
    expect(await svc.remind(d1)).toBe('already')
    expect(notify.send).toHaveBeenCalledTimes(1)
    expect((notify.send.mock.calls[0] as unknown[])[0]).toMatchObject({ text: expect.stringContaining('은 / 는') })
    const d31 = new Date(T0 + 31 * DAY_MS)
    d31.setHours(13, 0, 0, 0)
    expect(await svc.remind(d31)).toBe('sent')
  })
})
