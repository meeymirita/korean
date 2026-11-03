import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { G } = await load('/src/data/korean/grammar.ts')
after(close)

describe('что я уже знаю: данные карточек', () => {
  test('у каждой пройденной темы с уроком есть формула или пример для выжимки', () => {
    const ok = G.filter(g => g.st === 'ok' && g.l)
    assert.ok(ok.length >= 10)
    for (const g of ok) {
      const has = g.b.some(b => b[0] === 'formula') || g.b.some(b => b[0] === 'ex')
      assert.ok(has, `${g.id}: нет ни формулы, ни примера`)
    }
  })
})
