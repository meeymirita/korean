// «Печать на корейском» пишет в журнал ответов, но не даёт очков, монеток, серии и не двигает цель дня (`reward: false`).
import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useProgressStore, dayKey } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
let store
beforeEach(() => {
  ls.clear()
  globalThis.fetch = offline
  setActivePinia(createPinia())
  store = useProgressStore()
})
afterEach(() => {
  store.disconnect()
  globalThis.fetch = realFetch
})

describe('ответ без награды', () => {
  test('попадает в журнал и счётчик раздела, но не в слова, очки, монетки, серию и день', () => {
    store.record({ word: '사람', ok: true, source: 'game' }) // обычный ответ для сравнения
    const before = JSON.parse(JSON.stringify(store.data))
    const r = store.record({ word: null, ok: true, source: 'trainer', mode: 'keyboard', reward: false, detail: { q: 'Набери: 사람', a: '사람', r: 'x1' } })
    const d = store.data
    assert.equal(r.levelUp, false)
    assert.equal(r.goalReached, false)
    assert.deepEqual([d.xp, d.coins, d.combo], [before.xp, before.coins, before.combo])
    assert.deepEqual(d.words, before.words)
    assert.deepEqual([d.days, d.all], [before.days, before.all])
    assert.deepEqual(d.sources.trainer, { ok: 1, bad: 0 })
    assert.deepEqual([d.log[0].s, d.log[0].m, d.log[0].ok, d.log[0].w], ['trainer', 'keyboard', true, null])
    assert.equal(d.log[0].d.q, 'Набери: 사람')
    assert.equal(d.log[0].d.r, 'x1')
  })

  test('ошибка без награды не отнимает очки и не обрывает серию', () => {
    store.record({ word: '사람', ok: true, source: 'game' })
    store.record({ word: '집', ok: true, source: 'game' })
    const combo = store.data.combo
    const xp = store.data.xp
    store.record({ word: null, ok: false, source: 'trainer', mode: 'keyboard', reward: false, detail: { q: 'Набери: 집', a: '집', y: 'ошибок: 2' } })
    assert.equal(store.data.combo, combo)
    assert.equal(store.data.xp, xp)
    assert.deepEqual(store.data.sources.trainer, { ok: 0, bad: 1 })
    assert.equal(store.data.days[dayKey()], 2, 'цель дня считает только обычные ответы')
  })
})
