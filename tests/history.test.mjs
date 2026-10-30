import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { HISTORY, HISTORY_STATS } = await load('/src/data/history.ts')
after(close)

describe('история изменений', () => {
  test('у каждой записи есть дата, название, краткое описание и пункты; даты настоящие', () => {
    assert.ok(HISTORY.length >= 10)
    for (const e of HISTORY) {
      assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/)
      assert.ok(!Number.isNaN(new Date(e.date + 'T12:00:00').getTime()), e.date)
      assert.ok(e.title.trim() && e.summary.trim(), e.title)
      assert.ok(e.items.length >= 1 && e.items.every(i => i.trim().length > 10), `пункты «${e.title}»`)
    }
  })

  test('новое сверху: даты не возрастают, названия не повторяются', () => {
    const dates = HISTORY.map(e => e.date)
    assert.deepEqual(dates, [...dates].sort().reverse(), 'порядок должен быть от новых к старым')
    assert.equal(new Set(HISTORY.map(e => e.title)).size, HISTORY.length)
  })

  test('в тексте нет японских и китайских знаков и пола владельца в родовых формах', () => {
    const all = JSON.stringify(HISTORY)
    assert.ok(!/[぀-ヿ一-鿿]/.test(all), 'иероглифы')
    assert.ok(!/(?:^|[^а-я])я (?:сделала|сделал|добавила|добавил)/i.test(all))
  })

  test('цифры для шапки страницы считаются по записям', () => {
    assert.equal(HISTORY_STATS.stages, HISTORY.length)
    assert.equal(HISTORY_STATS.items, HISTORY.reduce((n, e) => n + e.items.length, 0))
  })
})
