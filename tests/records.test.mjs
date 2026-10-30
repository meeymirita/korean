import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { personalRecords, longestStreak } = await load('/src/data/records.ts')
const { normalize } = await load('/src/stores/progress.ts')
after(close)

const mk = (days = {}, time = {}) => ({ ...normalize({ v: 1 }), days, time })
const now = new Date(2026, 9, 30)

describe('личные рекорды', () => {
  test('без данных рекордов нет', () => {
    const r = personalRecords(mk(), now)
    assert.deepEqual([r.bestDay, r.bestWeek, r.bestTime, r.longestStreak, r.todayIsBest], [null, null, null, 0, false])
  })

  test('лучший день, при равенстве более ранний', () => {
    const r = personalRecords(mk({ '2026-10-01': 10, '2026-10-05': 30, '2026-10-07': 30, '2026-10-09': 4 }), now)
    assert.deepEqual(r.bestDay, { key: '2026-10-05', n: 30 })
  })

  test('лучшая неделя считается по календарным неделям с понедельника', () => {
    // пн 5.10 – вс 11.10: 20+25 = 45; пн 12.10: 40
    const r = personalRecords(mk({ '2026-10-05': 20, '2026-10-11': 25, '2026-10-12': 40 }), now)
    assert.deepEqual(r.bestWeek, { key: '2026-10-05', n: 45 })
  })

  test('самая длинная серия дней подряд', () => {
    assert.equal(longestStreak({ '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-10': 1, '2026-10-11': 1 }), 3)
    assert.equal(longestStreak({}), 0)
    assert.equal(longestStreak({ '2026-10-01': 5 }), 1)
  })

  test('самое долгое занятие по секундам', () => {
    assert.deepEqual(personalRecords(mk({}, { '2026-10-03': 600, '2026-10-04': 1800 }), now).bestTime, { key: '2026-10-04', n: 1800 })
  })

  test('сегодня рекорд: сравнялся или побил, но не ноль', () => {
    assert.equal(personalRecords(mk({ '2026-10-20': 10, '2026-10-30': 12 }), now).todayIsBest, true)
    assert.equal(personalRecords(mk({ '2026-10-20': 10, '2026-10-30': 10 }), now).todayIsBest, true)
    assert.equal(personalRecords(mk({ '2026-10-20': 10, '2026-10-30': 9 }), now).todayIsBest, false)
    assert.equal(personalRecords(mk({ '2026-10-30': 0 }), now).todayIsBest, false)
  })
})
