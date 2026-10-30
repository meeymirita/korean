import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { syllableTask, syllableTasks, isCorrect, SYLLABLE_WORDS } = await load('/src/data/korean/syllables.ts')
after(close)

describe('собери слово по слогам', () => {
  test('слова только хангылем, от двух до четырёх слогов', () => {
    assert.ok(SYLLABLE_WORDS.length > 100)
    for (const w of SYLLABLE_WORDS) assert.match(w.k, /^[가-힣]{2,4}$/)
  })

  test('плитки содержат все слоги слова и лишние, которых нет в слове', () => {
    for (const w of SYLLABLE_WORDS.slice(0, 80)) {
      const t = syllableTask(w)
      assert.deepEqual(t.answer, [...w.k])
      const left = [...t.tiles]
      for (const s of t.answer) {
        const i = left.indexOf(s)
        assert.ok(i >= 0, `нет слога ${s} в плитках ${w.k}`)
        left.splice(i, 1)
      }
      assert.ok(left.length >= 1 && left.length <= 2, 'лишних плиток 1–2')
      for (const e of left) assert.ok(!t.answer.includes(e), 'лишний слог из слова')
    }
  })

  test('проверка: слоги в верном порядке дают слово, в неверном нет, неполный набор нет', () => {
    const t = syllableTask(SYLLABLE_WORDS.find(w => w.k.length === 2 && w.k[0] !== w.k[1]))
    assert.equal(isCorrect(t, t.answer), true)
    assert.equal(isCorrect(t, [...t.answer].reverse()), false)
    assert.equal(isCorrect(t, [t.answer[0]]), false)
    assert.equal(isCorrect(t, []), false)
  })

  test('набор: десять разных слов, слова с ошибками первыми', () => {
    const weak = SYLLABLE_WORDS.slice(0, 4).map(w => w.k)
    const t = syllableTasks(10, weak)
    assert.equal(t.length, 10)
    assert.equal(new Set(t.map(x => x.word.k)).size, 10)
    assert.deepEqual(new Set(t.slice(0, 4).map(x => x.word.k)), new Set(weak))
  })
})
