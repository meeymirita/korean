import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { answersByDay } = await load('/src/data/charts.ts')
after(close)

const NOW = new Date(2026, 9, 30, 15, 0)
const empty = () => ({ v: 1, updated: 0, xp: 0, days: {}, all: {}, time: {}, words: {}, sources: {}, log: [] })

describe('данные графика ответов', () => {
  test('n дней, последний — сегодня, пропуски — нули', () => {
    const p = empty()
    p.all['2026-10-30'] = 10
    p.days['2026-10-30'] = 7
    p.all['2026-10-28'] = 3
    const a = answersByDay(p, 5, NOW)
    assert.equal(a.length, 5)
    assert.deepEqual(a.map(x => x.key), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])
    assert.deepEqual([a[4].all, a[4].ok, a[3].all, a[2].all], [10, 7, 0, 3])
    assert.equal(a[4].label, '30.10')
  })
})
