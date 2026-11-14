import { describe, expect, it } from 'vitest'
import { weakRules } from '@/data/charts'
import type { LogEntry } from '@/stores/progress'

describe('weak rules chart data', () => {
  it('groups recent trainer answers by grammar card and omits old answers', () => {
    const now = Date.UTC(2026, 10, 9)
    const log: LogEntry[] = [
      { t: now - 1, w: null, ok: false, s: 'trainer', d: { g: 'eun' } },
      { t: now - 2, w: null, ok: true, s: 'trainer', d: { g: 'eun' } },
      { t: now - 3, w: null, ok: false, s: 'trainer', d: { g: 'eun' } },
      { t: now - 31 * 86_400_000, w: null, ok: true, s: 'trainer', d: { g: 'eun' } },
    ]
    expect(weakRules(log, 30, now)).toEqual([
      expect.objectContaining({ id: 'rule:eun', ok: 1, bad: 2, accuracy: 33 }),
    ])
  })

  it('groups game particles and does not chart small samples', () => {
    const now = Date.UTC(2026, 10, 9)
    const log: LogEntry[] = [
      { t: now, w: null, ok: true, s: 'game', d: { g: 'part' } },
      { t: now, w: null, ok: false, s: 'game', d: { g: 'part' } },
      { t: now, w: null, ok: true, s: 'game', d: { g: 'part' } },
      { t: now, w: null, ok: true, s: 'game', d: { g: 'num' } },
    ]
    expect(weakRules(log, 30, now)).toEqual([
      expect.objectContaining({ id: 'mode:part', label: 'Частицы', family: 'all', accuracy: 67 }),
    ])
  })

  it('слабыми считаются только правила с ошибками и точностью ниже 90%: 100% и «0 ошибок» в список не попадают', () => {
    const now = Date.UTC(2026, 10, 9)
    const mk = (g: string, ok: boolean): LogEntry => ({ t: now - 1, w: null, ok, s: 'game', d: { g } })
    const log: LogEntry[] = [
      mk('num', true), mk('num', true), mk('num', true), // «Числа»: 3 верно, 0 ошибок
      ...Array.from({ length: 13 }, () => mk('when', true)), mk('when', false), mk('when', false), mk('when', false), // «Время»: 81%
      ...Array.from({ length: 9 }, () => mk('form', true)), mk('form', false), // «Формы»: 90% ровно, не слабое
    ]
    const rows = weakRules(log, 30, now)
    expect(rows.map(r => r.label)).toEqual(['Время'])
    expect(rows[0]).toMatchObject({ accuracy: 81, game: 'when' })
    expect(rows[0]!.family, 'у «Времени» нет текстов по частицам: ссылка ведёт в игру').toBeUndefined()
  })
})
