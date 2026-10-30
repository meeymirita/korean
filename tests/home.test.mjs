import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { ruleOf, ruleCards, randomRule, HOME_RULE } = await load('/src/composables/useHome.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

describe('правило на главной', () => {
  test('берутся только пройденные карточки с примерами', () => {
    const cards = ruleCards()
    assert.ok(cards.length >= 5, 'есть из чего выбирать')
    assert.ok(cards.every(c => c.st === 'ok'))
    assert.ok(!cards.some(c => c.st === 'soon'), 'карточки «ещё рано» не показываются')
  })

  test('у каждого правила есть подпись, формула, примеры и ссылка на свою карточку', () => {
    for (const c of ruleCards()) {
      const r = ruleOf(c)
      assert.ok(r.label.startsWith('Грамматика · '), c.id)
      assert.ok(r.label.length <= 66, `${c.id}: подпись слишком длинная`)
      assert.ok(r.rule && r.examples, c.id)
      assert.deepEqual(r.to, { path: '/korean/grammar', query: { g: c.id } })
      assert.ok(G.some(g => g.id === r.to.query.g))
    }
  })

  test('в примерах нет меток цвета, тегов и обрывков', () => {
    for (const c of ruleCards()) {
      const { examples } = ruleOf(c)
      assert.ok(!/[{}|<>]/.test(examples), `${c.id}: ${examples}`)
      assert.ok(!examples.includes('…') && !examples.includes(' — '), c.id)
      assert.ok(examples.split(' · ').length <= 3)
    }
  })

  test('выбор зависит от случайного числа: разные числа дают разные правила, крайние значения не выходят за список', () => {
    const n = ruleCards().length
    const pick = x => randomRule(() => x).to.query.g
    assert.equal(pick(0), ruleCards()[0].id)
    assert.equal(pick(0.999999), ruleCards()[n - 1].id)
    assert.ok(new Set([0, 0.2, 0.4, 0.6, 0.8].map(pick)).size > 1)
  })

  test('на главной всегда готовое правило', () => {
    assert.ok(HOME_RULE.rule && HOME_RULE.examples && HOME_RULE.to.query.g)
  })
})

describe('фраза дня', async () => {
  const { PHRASES, pickPhrase } = await load('/src/data/phrases.ts')

  test('фраз достаточно, у каждой есть перевод, будущего времени нет', () => {
    assert.ok(PHRASES.length >= 15)
    assert.equal(new Set(PHRASES.map(p => p.ko)).size, PHRASES.length, 'без повторов')
    for (const p of PHRASES) {
      assert.ok(p.ko.trim() && p.ru.trim())
      assert.ok(!/ㄹ 거|을 거|겠/.test(p.ko), `будущее время не проходили: ${p.ko}`)
      assert.ok(!/[぀-ヿ一-鿿]/.test(p.ko + p.ru), 'без японских и китайских знаков')
    }
  })

  test('следующая фраза никогда не совпадает с прошлой', () => {
    for (let last = 0; last < PHRASES.length; last++) {
      for (const r of [0, 0.3, 0.99]) assert.notEqual(pickPhrase(() => r, last).index, last)
    }
    assert.equal(pickPhrase(() => 0, -1).index, 0, 'без прошлой берётся как выпало')
  })
})

describe('две фразы дня', async () => {
  const { PHRASES, pickOther } = await load('/src/data/phrases.ts')
  test('вторая фраза никогда не совпадает с первой, даже при крайних значениях случайности', () => {
    for (const first of PHRASES) for (const r of [0, 0.5, 0.999]) assert.notEqual(pickOther([first], () => r).ko, first.ko)
  })
})
