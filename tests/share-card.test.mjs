import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { wrapLines } = await load('/src/lib/shareCard.ts').catch(() => ({}))
after(close)

// ширина в тестах = число знаков, так проверяется только логика переносов
const w = s => s.length

describe('карточка для соцсетей: переносы', { skip: !wrapLines }, () => {
  test('слова не рвутся, строки не длиннее предела', () => {
    const lines = wrapLines(w, 'раз два три четыре пять шесть', 10, 5)
    assert.deepEqual(lines, ['раз два', 'три четыре', 'пять шесть'])
    for (const l of lines) assert.ok(w(l) <= 10)
  })
  test('длинное слово остаётся целым на своей строке', () => {
    assert.deepEqual(wrapLines(w, 'а сверхдлинноеслово б', 6, 5), ['а', 'сверхдлинноеслово', 'б'])
  })
  test('лишние строки заменяются многоточием', () => {
    const lines = wrapLines(w, 'раз два три четыре пять шесть семь', 8, 2)
    assert.equal(lines.length, 2)
    assert.ok(lines[1].endsWith('…'))
  })
  test('пустой текст — пустой список', () => {
    assert.deepEqual(wrapLines(w, '   ', 10, 2), [])
  })
})
