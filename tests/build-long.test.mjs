import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { LONG_SENTENCES, checkLong, longClauses, longText, longTrap, longWords } = await load('/src/game/long-sentences.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
after(close)

describe('«Собери предложение»: уровень «Мастер» (длинные предложения)', () => {
  test('62 предложения без повторов, с переводом и заметкой, слов от пяти', () => {
    assert.equal(LONG_SENTENCES.length, 62)
    assert.equal(new Set(LONG_SENTENCES.map(x => x.ko)).size, 62)
    for (const x of LONG_SENTENCES) {
      assert.match(x.ko, /[.?]$/, x.ko)
      assert.ok(x.ru.trim().length > 10 && x.note.trim().length > 5, x.ko)
      assert.ok(longWords(x).length >= 5, x.ko)
      assert.ok(!longText(x).includes('_'))
    }
  })

  test('все слова есть в словаре: разбор не оставляет неизвестных', () => {
    for (const x of LONG_SENTENCES) {
      const bad = analyze(longText(x)).filter(sg => sg.type === 'unknown').map(sg => sg.text)
      assert.deepEqual(bad, [], longText(x))
    }
  })

  test('перевод для «я» без рода, без иероглифов', () => {
    for (const x of LONG_SENTENCES) {
      assert.ok(!/(?:^|[^а-яё])я (?:[а-яё]+ ){0,4}[а-яё]+(?:ил|ал|ел|ёл|ла)(?![а-яё(])/i.test(x.ru), x.ru)
      assert.ok(!/(?:устал|встретил|один)(?![а-яё(])/i.test(x.ru.replace(/один хлеб/, '')), x.ru)
      assert.ok(!/[぀-ヿ一-鿿]/.test(x.ko + x.ru + x.note))
    }
  })

  test('порядок учебника принимается; перестановка групп внутри части тоже; сказуемое не в конце, чужая часть и неверная частица не принимаются', () => {
    for (const x of LONG_SENTENCES) {
      const words = longWords(x)
      assert.ok(checkLong(x, words), longText(x))
      const cls = longClauses(x)
      // переставляем свободные группы первой части в обратном порядке
      const first = cls[0]
      const free = first.slice(0, -1)
      if (free.length >= 2 && free[0].join(' ') !== free[free.length - 1].join(' ')) {
        const alt = [[...free].reverse(), [first[first.length - 1]], ...cls.slice(1)].flat(2)
        assert.ok(checkLong(x, alt), 'перестановка: ' + alt.join(' '))
      }
      // сказуемое первой части в начале
      if (first.length >= 2) {
        const bad = [first[first.length - 1], ...first.slice(0, -1), ...cls.slice(1)].flat(2)
        if (bad.join(' ') !== words.join(' ')) assert.ok(!checkLong(x, bad), 'сказуемое в начале: ' + bad.join(' '))
      }
      assert.ok(!checkLong(x, words.slice(0, -1)), 'без последнего слова')
      const k = words.findIndex(w => longTrap(w))
      if (k >= 0) {
        const bad = words.slice()
        bad[k] = longTrap(bad[k])
        assert.ok(!checkLong(x, bad), 'неверная частица: ' + bad.join(' '))
      }
    }
  })

  test('лишние плитки: 에 ↔ 에서 и частица не по 받침', () => {
    assert.equal(longTrap('집에서'), '집에')
    assert.equal(longTrap('학교에'), '학교에서')
    assert.equal(longTrap('과일을'), '과일를')
    assert.equal(longTrap('영화를'), '영화을')
    assert.equal(longTrap('선생님은'), '선생님는')
    assert.equal(longTrap('저는'), '저은')
    assert.equal(longTrap('같이'), '')
  })
})
