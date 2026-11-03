import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { achievedAt, markAchieved } = await load('/src/lib/achievedDates.ts')
after(close)
beforeEach(() => ls.clear())

describe('даты достижений (только в этом браузере)', () => {
  test('без отметки — null', () => {
    assert.equal(achievedAt('d100'), null)
  })

  test('отметка запоминает текущее время', () => {
    const before = Date.now()
    markAchieved('d100')
    const at = achievedAt('d100')
    assert.ok(at !== null && at >= before && at <= Date.now())
  })

  test('повторная отметка не меняет уже сохранённую дату', () => {
    markAchieved('d100')
    const first = achievedAt('d100')
    markAchieved('d100')
    assert.equal(achievedAt('d100'), first)
  })

  test('разные достижения хранятся отдельно', () => {
    markAchieved('d100')
    assert.equal(achievedAt('m1000'), null)
  })
})
