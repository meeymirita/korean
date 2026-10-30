import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'
import { reply } from './_helpers.mjs'
import { createPinia, setActivePinia } from 'pinia'

const ls = stubLocalStorage()
const { dayScore, moodSummary } = await load('/src/data/mood.ts')
const { normalize, useProgressStore, dayKey } = await load('/src/stores/progress.ts')
after(close)

describe('настроение занятий', () => {
  test('оценка дня — среднее по отметкам, без отметок нет оценки', () => {
    assert.equal(dayScore(undefined), null)
    assert.equal(dayScore([0, 0, 0]), null)
    assert.equal(dayScore([2, 0, 0]), 1)
    assert.equal(dayScore([1, 0, 1]), 2)
    assert.equal(dayScore([0, 0, 3]), 3)
  })

  test('сводка: счётчики, последние 14 дней и самый тяжёлый день недели', () => {
    // понедельники лёгкие, среды тяжёлые (по три дня на каждый день недели)
    const now = new Date(2026, 9, 30) // пятница
    const moods = {}
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19']) moods[d] = [1, 0, 0] // пн
    for (const d of ['2026-10-07', '2026-10-14', '2026-10-21']) moods[d] = [0, 0, 2] // ср
    const s = moodSummary(moods, now)
    assert.equal(s.total, 9)
    assert.deepEqual(s.counts, [3, 0, 6])
    assert.equal(s.recent.length, 14)
    assert.equal(s.recent.at(-1).key, '2026-10-30')
    assert.equal(s.recent.find(r => r.key === '2026-10-21').score, 3)
    assert.equal(s.hardest, 'в среду')
  })

  test('мало данных или везде одинаково: про день недели не говорит', () => {
    assert.equal(moodSummary({}, new Date(2026, 9, 30)).hardest, null)
    assert.equal(moodSummary({ '2026-10-07': [0, 0, 1] }, new Date(2026, 9, 30)).hardest, null)
    const same = {}
    for (const d of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-07', '2026-10-14', '2026-10-21']) same[d] = [0, 1, 0]
    assert.equal(moodSummary(same, new Date(2026, 9, 30)).hardest, null)
  })

  test('в прогрессе: отметка копится за день, лишнее из файла отбрасывается', () => {
    ls.clear()
    globalThis.fetch = async () => reply(500, {})
    setActivePinia(createPinia())
    const store = useProgressStore()
    store.addMood('easy')
    store.addMood('hard')
    store.addMood('hard')
    assert.deepEqual(store.data.moods[dayKey()], [1, 0, 2])
    const d = normalize({ v: 1, moods: { '2026-10-01': [1, 2, 3, 4], 'плохо': [1], '2026-10-02': 'x', '2026-10-03': [-5, 'a', 5000] } })
    assert.deepEqual(d.moods, { '2026-10-01': [1, 2, 3], '2026-10-03': [0, 0, 1000] })
    store.disconnect()
  })
})
