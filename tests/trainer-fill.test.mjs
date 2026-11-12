import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { SETS, PAIR_SETS, fillsFromDict, pool, pickRound } = await load('/src/data/korean/trainer.ts')
after(close)

describe('«Найди пару»: добавка слов из всего словаря', () => {
  test('у наборов по грамматике и предложений добавки нет, у тем словаря есть', () => {
    for (const s of [...SETS, ...PAIR_SETS]) assert.equal(fillsFromDict(s.id), false, s.id)
    assert.equal(fillsFromDict(''), true)
    assert.equal(fillsFromDict('food'), true)
  })

  test('«Вопросительные слова»: раунд только из своих слов, даже если просят больше', () => {
    const own = new Set(pool('qwords').map(w => w.k))
    const round = pickRound(pool('qwords'), 20)
    assert.equal(round.length, own.size)
    for (const w of round) assert.ok(own.has(w.k), w.k)
  })
})
