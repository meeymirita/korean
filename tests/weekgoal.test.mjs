import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { weekGoal, weekGoalSettings } = await load('/src/data/weekgoal.ts')
const levels = await load('/src/data/levels.ts')
after(close)

const settings = (s = {}) => ({ goal: 20, cats: [], gameCats: null, marks: [], keys: {}, ...s })
const NOW = new Date('2026-11-12T12:00:00') // четверг; понедельник 2026-11-09

describe('недельная цель', () => {
  test('по умолчанию 5 дней и 100 верных; старые настройки без полей работают', () => {
    assert.deepEqual(weekGoalSettings(settings()), { days: 5, ok: 100 })
    assert.deepEqual(weekGoalSettings(null), { days: 5, ok: 100 })
    assert.deepEqual(weekGoalSettings({ weekDays: 8, weekOk: 5 }), { days: 5, ok: 100 })
    assert.deepEqual(weekGoalSettings({ weekDays: 3, weekOk: 250 }), { days: 3, ok: 250 })
  })

  test('неделя с понедельника: прошлое воскресенье не считается', () => {
    const p = { all: { '2026-11-08': 50, '2026-11-09': 10, '2026-11-11': 4 }, days: { '2026-11-08': 40, '2026-11-09': 8, '2026-11-11': 2 }, settings: settings() }
    const w = weekGoal(p, NOW)
    assert.deepEqual([w.start, w.days, w.ok, w.goalDays, w.goalOk, w.done], ['2026-11-09', 2, 10, 5, 100, false])
  })

  test('день занятий: был ответ, пусть и неверный', () => {
    const p = { all: { '2026-11-10': 3 }, days: {}, settings: settings() }
    assert.equal(weekGoal(p, NOW).days, 1)
  })

  test('выполнена только при обоих числах; воскресенье входит в неделю', () => {
    const days = { '2026-11-09': 30, '2026-11-10': 30, '2026-11-11': 30, '2026-11-12': 5, '2026-11-15': 6 }
    const p = { all: { ...days }, days, settings: settings() }
    assert.equal(weekGoal(p, new Date('2026-11-15T20:00:00')).done, true) // 5 дней, 101 верный
    assert.equal(weekGoal({ ...p, all: { ...days, '2026-11-15': 0 }, days: { ...days, '2026-11-15': 0 } }, NOW).done, false) // без воскресенья 4 дня и 95 верных
    assert.equal(weekGoal({ ...p, settings: settings({ weekOk: 150 }) }, new Date('2026-11-15T20:00:00')).done, false)
    assert.equal(weekGoal({ ...p, settings: settings({ weekDays: 4 }) }, new Date('2026-11-15T20:00:00')).done, true)
  })

  test('доля кольца: меньшая из двух, не больше 1', () => {
    const p = { all: { '2026-11-09': 1 }, days: { '2026-11-09': 500 }, settings: settings({ weekDays: 2 }) }
    assert.equal(weekGoal(p, NOW).ratio, 0.5)
    assert.equal(weekGoal({ all: {}, days: {}, settings: settings() }, NOW).ratio, 0)
  })

  test('границы на сайте и на сервере одни и те же', () => {
    const src = readFileSync(new URL('../backend/src/study/week-goal.ts', import.meta.url), 'utf8')
    const num = name => Number(src.match(new RegExp(`${name} = (\\d+)`))[1])
    const range = name => src.match(new RegExp(`${name} = \\[(\\d+), (\\d+)\\]`)).slice(1).map(Number)
    assert.equal(num('WEEK_DAYS_DEFAULT'), levels.WEEK_DAYS_DEFAULT)
    assert.equal(num('WEEK_OK_DEFAULT'), levels.WEEK_OK_DEFAULT)
    assert.deepEqual(range('WEEK_DAYS_RANGE'), [...levels.WEEK_DAYS_RANGE])
    assert.deepEqual(range('WEEK_OK_RANGE'), [...levels.WEEK_OK_RANGE])
  })
})
