import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { matchDetail, pool } = await load('/src/data/korean/trainer.ts')
after(close)

const adj = pool('adjectives')
const small = adj.find(w => w.k === '작다')
const few = adj.find(w => w.k === '적다')
const shot = { via: 'линией', leftText: '작다 чакта', rightText: 'мало', leftOpen: ['작다 чакта', '적다 чокта'], rightOpen: ['мало', 'маленький'] }

describe('«Найди пару»: что попадает в журнал ответов', () => {
  test('ошибка: слово, верный перевод, с чем соединили и что было на экране', () => {
    const d = matchDetail(small, few, shot)
    assert.equal(d.q, '작다')
    assert.equal(d.a, 'маленький')
    assert.equal(d.y, 'мало')
    assert.equal(d.n, 'линией; соединено: «작다 чакта» и «мало»; слева оставались: 작다 чакта · 적다 чокта; справа оставались: мало · маленький')
  })

  test('верный ответ: без «ты ответил», но со способом и экраном', () => {
    const d = matchDetail(few, few, { ...shot, via: 'нажатием', leftText: '적다 чокта' })
    assert.equal(d.q, '적다')
    assert.equal(d.a, 'мало')
    assert.ok(!('y' in d))
    assert.match(d.n, /^нажатием; соединено: «적다 чокта» и «мало»/)
  })

  test('предложение без слова в прогрессе всё равно подписано в журнале', () => {
    const s = pool('sent')[0]
    const d = matchDetail(s, s, { ...shot, leftText: s.k, rightText: s.t })
    assert.equal(d.q, s.k)
    assert.ok(d.a)
  })
})
