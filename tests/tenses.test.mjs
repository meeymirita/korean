import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { TENSES, TENSE_ORDER } = await load('/src/data/korean/tenses.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
const { D } = await load('/src/data/korean/words.ts')
const { futureForm } = await load('/src/data/korean/conjugation.ts')
after(close)

const entries = Object.entries(TENSES)
const dictionary = new Map(D.map(w => [w.k, w]))
const noSpace = s => s.replace(/\s+/g, '')

describe('три времени слов (tenses.ts)', () => {
  test('порядок времён и формат записей', () => {
    assert.deepEqual(TENSE_ORDER, ['present', 'past', 'future'])
    for (const [k, t] of entries) {
      assert.equal(t.f.length, 3, k)
      assert.equal(t.s.length, 3, k)
      for (const f of t.f) assert.ok(f.trim(), `${k}: пустая форма`)
      for (const [ko, ru] of t.s) assert.ok(ko.trim() && ru.trim(), `${k}: пустое предложение`)
      assert.ok(t.f[2].endsWith(' 거예요'), `${k}: будущее должно быть «… 거예요»: ${t.f[2]}`)
    }
  })

  test('слово есть в словаре и оканчивается на 다', () => {
    for (const [k] of entries) {
      assert.ok(dictionary.has(k), `${k}: нет в словаре`)
      assert.ok(k.endsWith('다'), k)
    }
  })

  test('в каждом предложении стоит форма своего времени', () => {
    for (const [k, t] of entries) {
      const [pres, past, fut] = t.s.map(x => noSpace(x[0]))
      assert.ok(pres.includes(noSpace(t.f[0]).replace(/요$/, '')), `${k}: настоящее «${t.f[0]}» не в «${pres}»`)
      assert.ok(past.includes(noSpace(t.f[1]).replace(/요$/, '')), `${k}: прошедшее «${t.f[1]}» не в «${past}»`)
      assert.ok(fut.includes(noSpace(t.f[2])), `${k}: будущее «${t.f[2]}» не в «${fut}»`)
    }
  })

  test('настоящее предложение совпадает с примером словаря (у слов, где пример не в настоящем времени, написано своё)', () => {
    const OWN = new Set(['구경하다'])
    for (const [k, t] of entries) if (!OWN.has(k)) assert.equal(t.s[0][0], dictionary.get(k).s, k)
  })

  test('у обычных глаголов будущее совпадает с futureForm (исключения: ㄷ / ㅂ и слова, которых там нет)', () => {
    for (const [k, t] of entries) {
      const auto = futureForm(k)
      if (auto) assert.equal(t.f[2], auto, k)
    }
  })

  test('все предложения разбираются без «нет в словаре»', () => {
    for (const [k, t] of entries) {
      for (const [ko] of t.s) {
        const bad = analyze(ko).filter(x => x.type === 'unknown').map(x => x.text)
        assert.deepEqual(bad, [], `${k}: «${ko}» не разобрано: ${bad}`)
      }
    }
  })

  test('предложения не повторяются, переводы без рода «я»', () => {
    const seen = new Set()
    for (const [k, t] of entries) {
      for (const [ko, ru] of t.s) {
        assert.ok(!seen.has(ko), `${k}: повтор «${ko}»`)
        seen.add(ko)
        assert.ok(!/(^|\s)я\s+[а-яё]+(л|ла)(\s|[.!?,]|$)/i.test(ru), `${k}: «я» с родом в «${ru}»`)
      }
    }
  })
})
