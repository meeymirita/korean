import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { translateTasks, TRANSLATE_DIRS } = await load('/src/data/korean/translate.ts')
const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
after(close)

const ruOf = new Map(Object.entries(TRANSLATIONS))
const koOf = new Map(Object.entries(TRANSLATIONS).map(([k, r]) => [r, k]))

describe('перевод предложений', () => {
  test('направления: три', () => assert.deepEqual(TRANSLATE_DIRS.map(d => d.id), ['ko-ru', 'ru-ko', 'mix']))

  test('корейский → русский: верный ответ — перевод предложения, 4 разных варианта', () => {
    for (let i = 0; i < 20; i++) {
      for (const t of translateTasks('ko-ru', 10)) {
        assert.equal(t.title, 'Переведи на русский')
        assert.equal(t.answer, ruOf.get(t.prompt))
        assert.equal(t.options.length, 4)
        assert.equal(new Set(t.options).size, 4)
        assert.ok(t.options.includes(t.answer))
      }
    }
  })

  test('русский → корейский: верный ответ — предложение с этим переводом', () => {
    for (const t of translateTasks('ru-ko', 10)) {
      assert.equal(t.title, 'Переведи на корейский')
      assert.equal(ruOf.get(t.answer), t.prompt) // у двух предложений может быть один русский перевод, поэтому сверяем в эту сторону
      assert.ok(t.options.includes(t.answer))
    }
  })

  test('вперемешку: бывают оба направления, ровно десять, номера подряд', () => {
    const kinds = new Set()
    for (let i = 0; i < 20; i++) {
      const t = translateTasks('mix', 10)
      assert.equal(t.length, 10)
      assert.deepEqual(t.map(x => x.id), [...Array(10).keys()])
      t.forEach(x => kinds.add(x.kind))
    }
    assert.deepEqual([...kinds].sort(), ['back', 'tr'])
  })

  test('вопросы в одном наборе не повторяются', () => {
    const t = translateTasks('mix', 10)
    assert.equal(new Set(t.map(x => x.prompt)).size, t.length)
  })
})
