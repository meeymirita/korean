import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { heatWeeks, heatLevel } = await load('/src/data/heat.ts')
const { dayKey } = await load('/src/stores/progress.ts')
after(close)

// пятница 30 октября 2026
const now = new Date(2026, 9, 30)

describe('календарь тепла', () => {
  test('уровни цвета: нет записи, ответы без верных, до 10, до цели, цель', () => {
    assert.deepEqual([null, 0, 5, 15, 20, 99].map(n => heatLevel(n, 20)), [0, 1, 2, 3, 4, 4])
    assert.equal(heatLevel(12, 10), 4, 'цель 10: двенадцать верных уже цель')
  })

  test('26 недель по 7 клеток, колонка начинается с понедельника, последняя неделя текущая', () => {
    const { cells } = heatWeeks({}, 20, 26, now)
    assert.equal(cells.length, 26 * 7)
    for (let c = 0; c < 26; c++) assert.equal(new Date(cells[c * 7].key + 'T12:00:00').getDay(), 1, `колонка ${c} начинается не с понедельника`)
    const last = cells.slice(-7)
    assert.equal(last[0].key, '2026-10-26')
    assert.deepEqual(last.map(x => x.future), [false, false, false, false, false, true, true])
    assert.equal(last[4].key, '2026-10-30')
  })

  test('цвета берутся из ответов по дням, будущие дни без данных', () => {
    const { cells } = heatWeeks({ [dayKey(new Date(2026, 9, 28))]: 25, [dayKey(new Date(2026, 9, 27))]: 0 }, 20, 4, now)
    const by = Object.fromEntries(cells.map(c => [c.key, c]))
    assert.equal(by['2026-10-28'].level, 4)
    assert.equal(by['2026-10-27'].level, 1)
    assert.equal(by['2026-10-26'].level, 0)
    assert.equal(by['2026-10-31'].future, true)
  })

  test('подписи месяцев идут по порядку и без повторов подряд', () => {
    const { months } = heatWeeks({}, 20, 26, now)
    assert.ok(months.length >= 6 && months.length <= 8)
    for (let i = 1; i < months.length; i++) {
      assert.notEqual(months[i].label, months[i - 1].label)
      assert.ok(months[i].col > months[i - 1].col)
    }
    assert.equal(months.at(-1).label, 'окт')
  })
})
