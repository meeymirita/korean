import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { mistakeWords, mistakeTasks } = await load('/src/data/mistakes.ts')
const { normalize } = await load('/src/stores/progress.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const stat = (ok, bad, streak = 0) => ({ ok, bad, streak, last: 1 })
function data(map) {
  const p = normalize({ v: 1 })
  for (const [k, s] of Object.entries(map)) p.words[k] = s
  return p
}
const [a, b, c, d] = D.slice(0, 4).map(x => x.k)

describe('мои ошибки', () => {
  test('слова без ошибок и чужие слова не попадают', () => {
    const p = data({ [a]: stat(5, 0), 'нет такого': stat(0, 9), [b]: stat(1, 1) })
    assert.deepEqual(mistakeWords(p).map(m => m.word.k), [b])
  })

  test('сначала где больше ошибок, при равенстве где выше доля неверных', () => {
    const p = data({ [a]: stat(0, 2), [b]: stat(10, 5), [c]: stat(1, 2), [d]: stat(0, 1) })
    assert.deepEqual(mistakeWords(p).map(m => m.word.k), [b, a, c, d])
  })

  test('выученное слово с ошибками в прошлом помечено, лимит работает', () => {
    const p = data({ [a]: stat(6, 2, 3), [b]: stat(0, 1) })
    const m = mistakeWords(p)
    assert.equal(m.find(x => x.word.k === a).learned, true)
    assert.equal(m.find(x => x.word.k === b).learned, false)
    assert.equal(mistakeWords(p, 1).length, 1)
  })

  test('тренировка: по заданию на слово с ошибкой, ответ среди вариантов; без ошибок пусто', () => {
    const p = data({ [a]: stat(0, 2), [b]: stat(0, 3), [c]: stat(0, 1) })
    const t = mistakeTasks(p, 10)
    assert.equal(t.length, 3)
    assert.deepEqual(new Set(t.map(x => x.word)).size, 3)
    for (const x of t) assert.ok(x.options.includes(x.answer))
    assert.deepEqual(mistakeTasks(data({ [a]: stat(4, 0) })), [])
  })
})
