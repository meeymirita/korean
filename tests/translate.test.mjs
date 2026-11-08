import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { translateTasks, TRANSLATE_DIRS, TRANSLATE_LEVELS, TEXT_LEVEL } = await load('/src/data/korean/translate.ts')
const { STORIES } = await load('/src/game/stories.ts')
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

describe('перевод предложений: уровни по длине', () => {
  const syl = ko => ko.replace(/[^가-힣]/g, '').length
  test('четыре уровня: любой, простой, средний, сложный', () => {
    assert.deepEqual(TRANSLATE_LEVELS.map(l => l.id), ['any', 'easy', 'medium', 'hard'])
  })
  test('предложения задания укладываются в длину уровня, серия полная', () => {
    for (const l of TRANSLATE_LEVELS.filter(x => x.id !== 'any')) {
      const tasks = translateTasks('mix', 10, l.id)
      assert.equal(tasks.length, 10, l.id)
      for (const t of tasks) {
        const n = syl(t.sentence)
        assert.ok(n >= l.min && n <= l.max, `${l.id}: ${t.sentence} (${n})`)
      }
    }
  })
  test('на каждый уровень хватает предложений', () => {
    for (const l of TRANSLATE_LEVELS.filter(x => x.id !== 'any')) {
      assert.ok(Object.keys(TRANSLATIONS).filter(k => syl(k) >= l.min && syl(k) <= l.max).length >= 30, l.id)
    }
  })
})

describe('перевод предложений: уровень «Текст»', () => {
  test('есть отдельный чип «Текст», он не входит в уровни по длине', () => {
    assert.equal(TEXT_LEVEL.id, 'text')
    assert.equal(TEXT_LEVEL.label, 'Текст')
    assert.ok(!TRANSLATE_LEVELS.some(l => l.id === 'text'))
  })

  test('задание: рассказ целиком, четыре разных рассказа в вариантах, верный среди них, у вариантов есть пара на другом языке', () => {
    for (const dir of ['ko-ru', 'ru-ko', 'mix']) {
      const tasks = translateTasks(dir, 10, 'text')
      assert.equal(tasks.length, STORIES.length, dir)
      for (const t of tasks) {
        assert.equal(t.options.length, 4)
        assert.equal(new Set(t.options).size, 4, 'варианты разные')
        assert.ok(t.options.includes(t.answer))
        assert.ok((t.prompt.match(/[.?!]/g) ?? []).length >= 2, 'в вопросе несколько предложений')
        const ko = /[가-힣]/.test(t.prompt)
        assert.equal(t.kind, ko ? 'tr' : 'back')
        if (dir === 'ko-ru') assert.ok(ko)
        if (dir === 'ru-ko') assert.ok(!ko)
        assert.ok(Object.keys(t.pairOf).length >= 3, 'пары на другом языке')
        assert.match(t.sentence, /[가-힣]/)
      }
    }
  })

  test('верный вариант это перевод именно этого рассказа', () => {
    for (const t of translateTasks('ko-ru', 10, 'text')) {
      const st = STORIES.find(s => s.sents.map(x => x.ko).join(' ') === t.prompt)
      assert.ok(st, 'рассказ найден')
      assert.equal(t.answer, st.sents.map(x => x.ru).join(' '))
    }
  })
})
