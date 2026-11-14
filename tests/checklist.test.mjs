import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { checklistFor, answersToday, snapshot, CHECK_MIN, CHECK_MAX, TRAINER } = await load('/src/data/checklist.ts')
const { ALL_GAMES, TOOL_IDS } = await load('/src/data/games.ts')
after(close)

describe('чек-лист на день', () => {
  test('в один день набор одинаковый, в разные дни обычно разный', () => {
    assert.deepEqual(checklistFor('2026-11-01'), checklistFor('2026-11-01'))
    const sets = new Set(Array.from({ length: 14 }, (_, i) => JSON.stringify(checklistFor(`2026-11-${String(i + 1).padStart(2, '0')}`).map(x => x.text))))
    assert.ok(sets.size >= 10)
  })

  test('по умолчанию пять пунктов: четыре с автоподсчётом и один ручной, у всех есть ссылка и цель 15–50 (у ручных своя)', () => {
    for (let d = 1; d <= 30; d++) {
      const list = checklistFor(`2026-11-${String(d).padStart(2, '0')}`)
      assert.equal(list.length, 5)
      const auto = list.filter(x => x.source)
      assert.equal(auto.length, 4)
      assert.equal(list.filter(x => !x.source).length, 1)
      assert.ok(auto.every(x => x.goal >= 15 && x.goal <= 50))
      assert.ok(list.every(x => x.to.startsWith('/') && x.goal > 0 && x.text))
    }
  })

  test('число пунктов задаётся: от 5 до максимума, остальное зажимается; один и тот же день с большим числом начинается с прежних пунктов', () => {
    assert.equal(CHECK_MIN, 5)
    assert.equal(checklistFor('2026-11-01', 2).length, 5)
    assert.equal(checklistFor('2026-11-01', 12).length, 12)
    assert.equal(checklistFor('2026-11-01', 9999).length, CHECK_MAX)
    const small = checklistFor('2026-11-01', 6).filter(x => x.source)
    const big = checklistFor('2026-11-01', 20).filter(x => x.source)
    assert.deepEqual(big.slice(0, small.length), small)
  })

  test('в полном списке каждая игра каталога по одному разу, а счётчики не пересекаются', () => {
    const list = checklistFor('2026-11-01', CHECK_MAX)
    assert.equal(new Set(list.map(x => x.id)).size, CHECK_MAX)
    const keys = list.filter(x => x.source).map(x => `${x.source}:${x.mode ?? ''}`)
    assert.equal(new Set(keys).size, keys.length)
    const games = list.filter(x => x.to.startsWith('/game/home'))
    assert.equal(games.length, ALL_GAMES.length)
    for (const g of ALL_GAMES) assert.ok(games.some(x => x.to === g.to), g.id)
  })

  test('ответы считаются только за этот день и этого источника', () => {
    const noon = new Date('2026-11-02T12:00:00').getTime()
    const log = [{ t: noon, w: 'a', ok: true, s: 'game' }, { t: noon, w: 'b', ok: false, s: 'game' }, { t: noon, w: 'c', ok: true, s: 'quick' }, { t: noon - 86400_000, w: 'd', ok: true, s: 'game' }]
    assert.equal(answersToday(log, 'game', '2026-11-02'), 2)
    assert.equal(answersToday(log, 'quick', '2026-11-02'), 1)
  })

  test('у пункта с режимом считаются только ответы этого режима', () => {
    const noon = new Date('2026-11-02T12:00:00').getTime()
    const log = [{ t: noon, w: null, ok: true, s: 'game', m: 'build' }, { t: noon, w: null, ok: true, s: 'game', m: 'form' }, { t: noon, w: null, ok: false, s: 'game', m: 'build' }]
    assert.equal(answersToday(log, 'game', '2026-11-02', 'build'), 2)
    assert.equal(answersToday(log, 'game', '2026-11-02'), 3)
    const [a] = snapshot([{ id: 'x', text: 't', to: '/g', goal: 2, source: 'game', mode: 'build' }], log, '2026-11-02', [])
    assert.deepEqual([a.have, a.done], [2, true])
  })

  test('снимок: выполнено при достижении цели, ручной пункт по галочке', () => {
    const items = [{ id: 'a', text: 'x', to: '/game', goal: 2, source: 'game' }, { id: 'b', text: 'y', to: '/korean/words', goal: 5 }]
    const noon = new Date('2026-11-02T12:00:00').getTime()
    const log = [{ t: noon, w: null, ok: true, s: 'game' }, { t: noon, w: null, ok: true, s: 'game' }, { t: noon, w: null, ok: true, s: 'game' }]
    const [a, b] = snapshot(items, log, '2026-11-02', [])
    assert.deepEqual([a.done, a.have, b.done, b.manual], [true, 2, false, true])
    assert.equal(snapshot(items, log, '2026-11-02', ['b'])[1].done, true)
  })

  test('все тренажёры (TOOL_IDS) считаются по журналу тренажёров: «Определи часть речи» и «Печать на корейском» раньше не засчитывались', () => {
    for (const id of TOOL_IDS) assert.ok(TRAINER[id], `у тренажёра «${id}» нет записи в TRAINER: пункт чек-листа искал бы его ответы среди игр и не засчитывал`)
    for (const id of ['speech', 'keyboard']) {
      const { source, mode } = TRAINER[id]
      assert.deepEqual([source, mode], ['trainer', id])
      const item = { id: 'x', text: id, to: '/', goal: 2, source, mode }
      const day = '2026-11-02'
      const t = new Date(day + 'T12:00:00').getTime()
      const log = [{ t, w: null, ok: true, s: 'trainer', m: id }, { t, w: null, ok: false, s: 'trainer', m: id }]
      assert.deepEqual(snapshot([item], log, day, []).map(x => [x.have, x.done]), [[2, true]], id)
    }
  })
})
