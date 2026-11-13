import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { marksTasks, markedWords, MARKS_DRILL_SIZE, MARKS_DRILL_MIN } = await load('/src/data/korean/marks-drill.ts')
const { normalize } = await load('/src/stores/progress.ts')
const { STUDY, EXTRA } = await load('/src/data/korean/study.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const withMarks = keys => {
  const p = normalize({ v: 1 })
  p.settings.marks = keys.map(k => 'w:' + k)
  return p
}
const stat = streak => ({ ok: streak, bad: 0, streak, last: Date.now() })
const words = STUDY.filter(d => /^[가-힣]+$/.test(d.k)).slice(0, 30).map(d => d.k)

describe('серия по важным словам', () => {
  test('меньше 4 слов: пусто', () => {
    assert.equal(MARKS_DRILL_MIN, 4)
    assert.deepEqual(marksTasks(withMarks(words.slice(0, 3))), [])
    assert.deepEqual(marksTasks(withMarks([])), [])
  })

  test('слова вне STUDY пропускаются и считаются; в заданиях только отмеченные', () => {
    const extra = D.find(d => EXTRA.has(d.k))
    assert.ok(extra, 'в словаре есть слово вне STUDY')
    const p = withMarks([...words.slice(0, 5), extra.k, 'нет-такого'])
    p.settings.marks.push('g:ok', 'd:1')
    const m = markedWords(p)
    assert.equal(m.usable.length, 5)
    assert.equal(m.skipped, 1)
    const t = marksTasks(p)
    assert.equal(t.length, 5)
    assert.ok(t.every(x => words.slice(0, 5).includes(x.word) && x.options.includes(x.answer)))
    assert.ok(!t.some(x => x.word === extra.k))
    assert.deepEqual(t.map(x => x.id).sort((a, b) => a - b), [0, 1, 2, 3, 4])
    // 3 годных слова и пропущенное: серии нет
    assert.deepEqual(marksTasks(withMarks([...words.slice(0, 3), extra.k])), [])
  })

  test('не больше 15 заданий, по слову одно', () => {
    const t = marksTasks(withMarks(words))
    assert.equal(t.length, MARKS_DRILL_SIZE)
    assert.equal(new Set(t.map(x => x.word)).size, t.length)
  })

  test('первыми слова с низкими очками', () => {
    const marked = words.slice(0, 20)
    const p = withMarks(marked)
    marked.slice(0, 15).forEach(k => (p.words[k] = stat(3)))
    for (let i = 0; i < 5; i++) {
      const got = new Set(marksTasks(p).map(x => x.word))
      assert.ok(marked.slice(15).every(k => got.has(k)), 'слова без очков вошли в серию')
    }
  })
})
