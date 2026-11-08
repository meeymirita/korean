import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { EXCHANGES } = await load('/src/game/dialogs.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
after(close)

describe('диалоги игры (режимы «Диалог» и «Вопросы»)', () => {
  test('пар достаточно (24 прежних и 28 из учебника), вопросы не повторяются', () => {
    assert.ok(EXCHANGES.length >= 50, 'пар: ' + EXCHANGES.length)
    const qs = EXCHANGES.map(e => e[0])
    assert.equal(new Set(qs).size, qs.length, 'повторяющийся вопрос')
    for (const e of EXCHANGES) {
      assert.equal(e.length, 5)
      assert.ok(e.every(x => typeof x === 'string' && x.length > 0))
      assert.match(e[0], /[가-힣]/)
      assert.match(e[1], /[а-яё]/i)
      assert.match(e[3], /[а-яё]/i)
    }
  })

  test('в вопросах и ответах разбор знает все слова (в карточках «Как собрано» нет «?»)', () => {
    for (const e of EXCHANGES) for (const text of [e[0], e[2]]) {
      const unknown = analyze(text).filter(s => s.type === 'unknown').map(s => s.text)
      assert.deepEqual(unknown, [], text)
    }
  })

  test('тегов достаточно для текста из 10 вопросов (в тексте теги разные)', () => {
    assert.ok(new Set(EXCHANGES.map(e => e[4])).size >= 30)
  })

  test('пары учебника не расходятся по типу: в ответе на «Да/Нет» есть «네» или «아니요», ответ «뭐» не начинается с «네»', () => {
    for (const e of EXCHANGES) {
      if (/(있어요|없어요|많아요|깨끗해요|맛있어요|먹어요|일해요|운동해요)\?$/.test(e[0]) && !/뭐|어디|누구|몇|얼마|무슨|어느/.test(e[0])) assert.match(e[2], /네|아니요|미안/, e[0])
      if (/뭐예요\?$/.test(e[0])) assert.doesNotMatch(e[2], /^(네|아니요)/, e[0])
    }
  })
})
