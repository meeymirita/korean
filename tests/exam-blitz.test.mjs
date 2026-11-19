import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { BLITZ_POINTS, BLITZ_SECONDS, blitzBlocks, blockPoints, examParts, partPoints } = await load('/src/data/korean/exam.ts')
after(close)

// Пробный блиц: около 20 пунктов из частей экзамена, 5 минут, ничего не записывается.
describe('блиц-экзамен: набор пунктов', () => {
  const parts = examParts(4)
  test('пунктов не меньше 20 и не больше 24, блоки взяты из частей экзамена', () => {
    for (let i = 0; i < 5; i++) {
      const b = blitzBlocks(parts)
      const n = partPoints(b)
      assert.ok(n >= BLITZ_POINTS && n <= BLITZ_POINTS + 4, `пунктов ${n}`)
      const all = new Set(parts.flat())
      assert.ok(b.every(x => all.has(x)))
      assert.equal(new Set(b).size, b.length, 'блоки без повторов')
      assert.ok(b.every(x => blockPoints(x) > 0))
    }
  })
  test('блоки каждый раз вперемешку, а не одни и те же', () => {
    const a = blitzBlocks(parts).map(b => b.title).join('|')
    const seen = new Set([a])
    for (let i = 0; i < 6; i++) seen.add(blitzBlocks(parts).map(b => b.title).join('|'))
    assert.ok(seen.size > 1)
  })
  test('пять минут', () => assert.equal(BLITZ_SECONDS, 300))
})
