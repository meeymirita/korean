import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { posWords, pickPosSet, posTasks, posWhy, POS_OPTIONS } = await load('/src/data/korean/part-of-speech.ts')
const { STUDY, EXTRA, STUDY_TRANSLATIONS } = await load('/src/data/korean/study.ts')
const { VERBS, ADJECTIVES, QWORDS } = await load('/src/data/korean/forms.ts')
after(close)

const study = new Set(STUDY.map(d => d.k))
const kinds = { verb: new Set(VERBS.map(x => x.k)), adj: new Set(ADJECTIVES.map(x => x.k)), qw: new Set(QWORDS.map(x => x.k)) }

describe('Определи часть речи', () => {
  test('слова: только из STUDY и только из готовых наборов, часть речи совпадает с набором', () => {
    const w = posWords()
    assert.ok(w.length > 80)
    assert.equal(new Set(w.map(x => x.k)).size, w.length)
    for (const x of w) {
      assert.ok(study.has(x.k), x.k)
      assert.ok(!EXTRA.has(x.k))
      assert.ok(kinds[x.pos].has(x.k), `${x.k}: ${x.pos}`)
      assert.ok(!['있다', '없다'].includes(x.k))
      if (x.sentence) assert.ok(x.sentence in STUDY_TRANSLATIONS)
      if (x.pos !== 'qw') assert.ok(x.form, x.k)
    }
    for (const p of ['verb', 'adj', 'qw']) assert.ok(w.some(x => x.pos === p))
  })

  test('серия: 15 заданий, три варианта, верный ответ по набору, объяснение, номера подряд', () => {
    const label = { verb: 'Глагол', adj: 'Прилагательное', qw: 'Вопросительное слово' }
    const byK = new Map(posWords().map(x => [x.k, x]))
    for (let i = 0; i < 10; i++) {
      const t = posTasks(15)
      assert.equal(t.length, 15)
      assert.deepEqual(t.map(x => x.id), [...Array(15).keys()])
      assert.equal(new Set(t.map(x => x.prompt)).size, 15)
      for (const x of t) {
        const w = byK.get(x.prompt)
        assert.ok(w)
        assert.deepEqual(x.options, POS_OPTIONS)
        assert.equal(x.answer, label[w.pos])
        assert.equal(x.note, posWhy(w))
        assert.ok(x.note.includes(x.prompt))
        assert.equal(x.word, undefined)
        if (x.sentence) assert.ok(x.sentence in STUDY_TRANSLATIONS)
      }
      const c = p => t.filter(x => x.answer === label[p]).length
      assert.equal(c('verb'), 5)
      assert.equal(c('adj'), 5)
      assert.equal(c('qw'), 5)
    }
  })

  test('pickPosSet: когда одной части речи мало, добирает из остальных, без повторов', () => {
    const words = [
      { k: 'a', t: 'x', pos: 'qw' },
      ...['b', 'c', 'd', 'e'].map(k => ({ k, t: 'x', pos: 'verb', form: 'f' })),
      ...['f', 'g'].map(k => ({ k, t: 'x', pos: 'adj', form: 'f' })),
    ]
    const r = pickPosSet(words, 6)
    assert.equal(r.length, 6)
    assert.equal(new Set(r.map(x => x.k)).size, 6)
    assert.equal(pickPosSet(words, 20).length, 7)
  })
})
