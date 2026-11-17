import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { G, tabOf } = await load('/src/data/korean/grammar.ts')
after(close)

const ahead = G.filter(g => g.ahead)
// «Что впереди»: темы без объяснения живут карточками-заглушками в «Моих карточках»; список «не пройдено» для помощников берётся из них же.
describe('карточки «что впереди»', () => {
  test('есть заглушки; это свои карточки (без номера урока), всегда «ещё рано», с уникальными id и коротким описанием', () => {
    assert.ok(ahead.length >= 8, `заглушек ${ahead.length}`)
    assert.equal(new Set(ahead.map(g => g.id)).size, ahead.length)
    for (const g of ahead) {
      assert.equal(tabOf(g), 0, `${g.id}: заглушка должна быть во «Моих карточках»`)
      assert.equal(g.st, 'soon', `${g.id}: заглушка не может быть пройденной (пройдена тема: убери ahead и допиши карточку)`)
      assert.ok(g.b.length >= 1 && g.d.length > 0)
    }
  })
  test('ни одна заглушка не называется так же, как пройденная карточка (тема и пройдена, и впереди)', () => {
    const passed = new Set(G.filter(g => g.st === 'ok').map(g => g.ko))
    for (const g of ahead) assert.ok(!passed.has(g.ko), `«${g.ko}» и пройдена, и впереди`)
  })
  test('заглушки лежат только в «Моих карточках» и не попадают в пройденное', () => {
    for (const g of G.filter(g => g.ahead)) assert.ok(!G.some(o => o !== g && o.id === g.id))
    assert.ok(G.filter(g => g.st === 'ok').every(g => !g.ahead))
  })
})
