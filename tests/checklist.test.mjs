import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { checklistFor, answersToday, snapshot } = await load('/src/data/checklist.ts')
after(close)

describe('чек-лист на день', () => {
  test('в один день набор одинаковый, в разные дни обычно разный', () => {
    assert.deepEqual(checklistFor('2026-11-01'), checklistFor('2026-11-01'))
    const sets = new Set(Array.from({ length: 14 }, (_, i) => JSON.stringify(checklistFor(`2026-11-${String(i + 1).padStart(2, '0')}`).map(x => x.text))))
    assert.ok(sets.size >= 10)
  })

  test('пять пунктов: четыре с автоподсчётом разных источников и один ручной, у всех есть ссылка', () => {
    for (let d = 1; d <= 30; d++) {
      const list = checklistFor(`2026-11-${String(d).padStart(2, '0')}`)
      assert.equal(list.length, 5)
      const auto = list.filter(x => x.source)
      assert.equal(auto.length, 4)
      assert.equal(list.filter(x => !x.source).length, 1)
      assert.equal(new Set(auto.map(x => x.source)).size, 4)
      assert.ok(list.every(x => x.to.startsWith('/') && x.goal > 0 && x.text))
    }
  })

  test('ответы считаются только за этот день и этого источника', () => {
    const noon = new Date('2026-11-02T12:00:00').getTime()
    const log = [{ t: noon, w: 'a', ok: true, s: 'game' }, { t: noon, w: 'b', ok: false, s: 'game' }, { t: noon, w: 'c', ok: true, s: 'quick' }, { t: noon - 86400_000, w: 'd', ok: true, s: 'game' }]
    assert.equal(answersToday(log, 'game', '2026-11-02'), 2)
    assert.equal(answersToday(log, 'quick', '2026-11-02'), 1)
  })

  test('снимок: выполнено при достижении цели, ручной пункт по галочке', () => {
    const items = [{ id: 'a', text: 'x', to: '/game', goal: 2, source: 'game' }, { id: 'b', text: 'y', to: '/korean/words', goal: 5 }]
    const noon = new Date('2026-11-02T12:00:00').getTime()
    const log = [{ t: noon, w: null, ok: true, s: 'game' }, { t: noon, w: null, ok: true, s: 'game' }, { t: noon, w: null, ok: true, s: 'game' }]
    const [a, b] = snapshot(items, log, '2026-11-02', [])
    assert.deepEqual([a.done, a.have, b.done, b.manual], [true, 2, false, true])
    assert.equal(snapshot(items, log, '2026-11-02', ['b'])[1].done, true)
  })
})
