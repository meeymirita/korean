import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { vocabForecast } = await load('/src/lib/forecast.ts')
after(close)

describe('прогноз «когда выучишь весь словарь»', () => {
  const now = Date.parse('2026-11-03T12:00:00')
  const day = 86_400_000

  test('без выученных слов — нечего прогнозировать', () => {
    const f = vocabForecast({}, 500, now)
    assert.deepEqual([f.learned, f.total, f.perWeek, f.weeksLeft, f.eta], [0, 500, 0, null, null])
  })

  test('весь словарь уже выучен — прогноз не нужен', () => {
    const words = { а: { ok: 5, bad: 0, streak: 5, last: now, kd: now - day } }
    const f = vocabForecast(words, 1, now)
    assert.equal(f.learned, 1)
    assert.equal(f.weeksLeft, null)
  })

  test('темп за последние 30 дней даёт прогноз в неделях', () => {
    const words = {}
    for (let i = 0; i < 10; i++) words['w' + i] = { ok: 5, bad: 0, streak: 5, last: now, kd: now - i * day }
    const f = vocabForecast(words, 10 + 23, now) // 10 выучено за месяц → 2.3 слов в неделю, осталось 23
    assert.equal(f.learned, 10)
    assert.equal(f.perWeek, 2.3)
    assert.equal(f.weeksLeft, 10)
    assert.match(f.eta, /через/)
  })

  test('слова, выученные больше месяца назад, в темп не считаются', () => {
    const words = { старое: { ok: 5, bad: 0, streak: 5, last: now, kd: now - 60 * day } }
    const f = vocabForecast(words, 10, now)
    assert.equal(f.learned, 1)
    assert.equal(f.perWeek, 0)
    assert.equal(f.weeksLeft, null)
  })
})
