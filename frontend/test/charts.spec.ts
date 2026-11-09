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
})
