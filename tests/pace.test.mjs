import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { paceSummary, clock, PACE_CAP } = await load('/src/data/pace.ts')
after(close)

describe('секундомер заданий', () => {
  test('итог: всего, в среднем, самое долгое задание', () => {
    assert.deepEqual(paceSummary([4, 10, 7]), { total: 21, avg: 7, slowest: 1 })
    assert.equal(paceSummary([]), null)
  })
  test('долгая пауза не раздувает время', () => {
    assert.equal(paceSummary([3000]).total, PACE_CAP)
  })
  test('формат времени', () => {
    assert.equal(clock(7), '7 с')
    assert.equal(clock(65), '1:05')
  })
})
