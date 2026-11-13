import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { explainTasks, explainCandidates, pickExplainSet, passedRulesOf } = await load('/src/data/korean/translate-explain.ts')
const { STUDY_TRANSLATIONS } = await load('/src/data/korean/study.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

const ok = new Set(G.filter(g => g.st === 'ok').map(g => g.id))

describe('Переведи и объясни', () => {
  test('кандидаты: только из STUDY_TRANSLATIONS и только по пройденным карточкам', () => {
    const c = explainCandidates()
    assert.ok(c.length > 500)
    for (const x of c) {
      assert.ok(x.ko in STUDY_TRANSLATIONS)
      assert.ok(x.rules.length > 0)
      for (const r of x.rules) assert.ok(ok.has(r), `${x.ko}: ${r}`)
    }
  })

  test('предложение с правилом, которое не пройдено, отбрасывается', () => {
    const bad = Object.keys(STUDY_TRANSLATIONS).filter(ko => passedRulesOf(ko) === null)
    for (const ko of bad) assert.ok(!explainCandidates().some(c => c.ko === ko))
  })

  test('серия: 15 заданий, 4 разных варианта, перевод верный, правила заданы, номера подряд', () => {
    for (let i = 0; i < 10; i++) {
      const t = explainTasks(15)
      assert.equal(t.length, 15)
      assert.deepEqual(t.map(x => x.id), [...Array(15).keys()])
      assert.equal(new Set(t.map(x => x.prompt)).size, 15)
      for (const x of t) {
        assert.equal(x.answer, STUDY_TRANSLATIONS[x.prompt])
        assert.equal(x.sentence, x.prompt)
        assert.equal(x.options.length, 4)
        assert.equal(new Set(x.options).size, 4)
        assert.ok(x.options.includes(x.answer))
        assert.ok(x.rules.length > 0)
      }
    }
  })

  test('в серии разные правила, не только самое частое', () => {
    const rules = new Set(explainTasks(15).flatMap(t => t.rules))
    assert.ok(rules.size >= 8, [...rules].join())
  })

  test('pickExplainSet: без повторов, не больше n, покрывает правила по кругу', () => {
    const cands = [
      { ko: 'a', rules: ['x'] }, { ko: 'b', rules: ['x'] }, { ko: 'c', rules: ['x', 'y'] }, { ko: 'd', rules: ['z'] },
    ]
    for (let i = 0; i < 20; i++) {
      const s = pickExplainSet(cands, 3)
      assert.equal(s.length, 3)
      assert.equal(new Set(s).size, 3)
      assert.ok(s.some(c => c.rules.includes('z')))
      assert.ok(s.some(c => c.rules.includes('y')))
    }
    assert.equal(pickExplainSet(cands, 10).length, 4)
    assert.deepEqual(pickExplainSet([], 5), [])
  })
})
