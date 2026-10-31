import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { withSeed, seededRandom } = await load('/src/lib/seeded.ts')
const { randomTasks, randomWords } = await load('/src/data/korean/tasks.ts')
after(close)

describe('набор дня от даты', () => {
  test('один seed даёт одну и ту же последовательность, другой seed другую', () => {
    const a = seededRandom('today:2026-10-31')
    const b = seededRandom('today:2026-10-31')
    assert.deepEqual([a(), a(), a()], [b(), b(), b()])
    assert.notEqual(seededRandom('today:2026-11-01')(), seededRandom('today:2026-10-31')())
  })

  test('Math.random возвращается после выхода, даже если внутри ошибка', () => {
    const orig = Math.random
    withSeed('x', () => Math.random())
    assert.equal(Math.random, orig)
    assert.throws(() => withSeed('x', () => { throw new Error('boom') }))
    assert.equal(Math.random, orig)
  })

  test('слова и задания «Сегодня» с одним seed одинаковы, без seed разные', () => {
    const make = seed => withSeed(seed, () => [randomWords(10, []).map(w => w.k), randomTasks(15, []).map(t => t.prompt + t.answer)])
    assert.deepEqual(make('d1'), make('d1'))
    assert.notDeepEqual(make('d1'), make('d2'))
  })
})
