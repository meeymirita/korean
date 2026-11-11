import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { close, load } from './_load.mjs'

const { cardOfRule, examWeakCards, examRules, WORD_RULES, FORM_RULES, DEM_RULE, QW_RULE, CNT_RULE } = await load('/src/data/korean/exam.ts')
const { G } = await load('/src/data/korean/grammar.ts')
const { trainableRule } = await load('/src/data/korean/rule-tasks.ts')
after(close)

describe('экзамен: слабые правила для серии «Слабые места»', () => {
  test('у правил экзамена (кроме чисел и формул) есть пройденная карточка с примерами', () => {
    const ids = [...examRules().map(r => r.id), ...WORD_RULES.map(r => r.id), ...FORM_RULES.map(r => r.id), DEM_RULE.id, QW_RULE.id, CNT_RULE.id]
    for (const id of ids) {
      const card = G.find(g => g.id === cardOfRule(id))
      assert.ok(card, `нет карточки у правила ${id}`)
      assert.equal(card.st, 'ok', id)
      assert.ok(trainableRule(card), `мало примеров у ${card.id} (правило ${id})`)
    }
    assert.equal(cardOfRule('num'), undefined)
    assert.equal(cardOfRule('phr'), undefined)
  })

  test('берутся правила ниже 70%, худшее первым, без повторов карточек и без правил без карточки', () => {
    const rules = { topic: { ok: 9, total: 10 }, object: { ok: 6, total: 10 }, past: { ok: 2, total: 10 }, num: { ok: 0, total: 5 }, have: { ok: 5, total: 10 }, place: { ok: 5, total: 10 } }
    assert.deepEqual(examWeakCards(rules), ['past_my', 'iss', 'eul'])
    assert.deepEqual(examWeakCards(undefined), [])
    assert.deepEqual(examWeakCards({ topic: { ok: 7, total: 10 } }), [])
  })
})
