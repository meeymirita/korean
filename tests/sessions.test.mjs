import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { groupSessions, lasted, SESSION_GAP } = await load('/src/data/sessions.ts')
after(close)

const T = Date.UTC(2026, 10, 12, 8, 0, 0)
const a = (sec, ok, extra = {}) => ({ t: T + sec * 1000, w: '작다', ok, source: 'trainer', mode: 'match', ...extra })

describe('отчёт: ответы делятся на занятия', () => {
  test('без номера раунда: новое занятие после перерыва или при смене режима', () => {
    const gap = SESSION_GAP / 1000
    const s = groupSessions([a(0, true), a(10, false), a(10 + gap + 1, true), a(20 + gap, true, { mode: 'typing' })])
    assert.equal(s.length, 3)
    assert.deepEqual(s.map(x => x.mode), ['typing', 'match', 'match'], 'новые сверху')
    const first = s[2]
    assert.deepEqual([first.ok, first.bad, first.items.length], [1, 1, 2])
    assert.equal(first.end - first.start, 10_000)
  })

  test('с номером раунда: два раунда подряд не сливаются, долгий раунд не рвётся', () => {
    const s = groupSessions([
      a(0, true, { d: { r: 'one' } }),
      a(600, false, { d: { r: 'one' } }),
      a(601, true, { d: { r: 'two' } }),
      a(602, true, { d: { r: 'two' } }),
    ])
    assert.equal(s.length, 2)
    assert.deepEqual(s.map(x => x.items.length), [2, 2])
    assert.deepEqual([s[1].ok, s[1].bad], [1, 1])
  })

  test('ответы внутри занятия идут по времени, порядок на входе не важен', () => {
    const [s] = groupSessions([a(30, true), a(0, false), a(15, true)])
    assert.deepEqual(s.items.map(x => (x.t - T) / 1000), [0, 15, 30])
  })

  test('длительность словами', () => {
    assert.equal(lasted(45_000), '45 с')
    assert.equal(lasted(200_000), '3 мин 20 с')
  })
})
