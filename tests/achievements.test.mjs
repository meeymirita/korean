import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { ACHIEVEMENTS } = await load('/src/data/achievements.ts')
const { normalize } = await load('/src/stores/progress.ts')
after(close)

const data = patch => normalize({ v: 1, ...patch })
const byId = id => ACHIEVEMENTS.find(a => a.id === id)

describe('достижения: сотня дней и тысяча за месяц', () => {
  test('d100: цель 100, текущее — серия дней подряд', () => {
    const [cur, goal] = byId('d100').progress(data({}), 42)
    assert.deepEqual([cur, goal], [42, 100])
  })

  test('m1000: считает только текущий календарный месяц', () => {
    const d = new Date()
    const thisMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const lastMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 15)
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
    const p = data({ days: { [`${thisMonth}-01`]: 300, [`${thisMonth}-02`]: 250, [`${lastMonth}-20`]: 900 } })
    const [cur, goal] = byId('m1000').progress(p, 0)
    assert.deepEqual([cur, goal], [550, 1000])
  })

  test('все достижения дают уникальные id', () => {
    const ids = ACHIEVEMENTS.map(a => a.id)
    assert.equal(new Set(ids).size, ids.length)
  })
})
