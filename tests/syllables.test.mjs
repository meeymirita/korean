import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { syllableTask, syllableTasks, isCorrect, SYLLABLE_WORDS, SYLLABLE_LEVELS } = await load('/src/data/korean/syllables.ts')
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

describe('собери по слогам: уровни', () => {
  test('четыре уровня: любой и по длине слова', () => {
    assert.deepEqual(SYLLABLE_LEVELS.map(l => l.id), ['any', 'easy', 'medium', 'hard'])
  })
  test('простой, средний и сложный дают слова из 2, 3 и 4 слогов, серия полная', () => {
    for (const [level, len] of [['easy', 2], ['medium', 3], ['hard', 4]]) {
      const t = syllableTasks(10, [], level)
      assert.equal(t.length, 10, level)
      for (const x of t) assert.equal(x.word.k.length, len, `${level}: ${x.word.k}`)
    }
  })
  test('любой уровень смешивает длины, слабые слова своего уровня идут первыми', () => {
    const lens = new Set(syllableTasks(30, [], 'any').map(x => x.word.k.length))
    assert.ok(lens.size >= 2)
    const weak = SYLLABLE_WORDS.filter(w => w.k.length === 3).slice(0, 3).map(w => w.k)
    const t = syllableTasks(10, weak, 'medium')
    assert.deepEqual(new Set(t.slice(0, 3).map(x => x.word.k)), new Set(weak))
  })
})
