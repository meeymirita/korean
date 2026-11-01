import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { chatErrorText, parseReply } = await load('/src/lib/chat.ts')
after(close)

describe('помощник-чат: тексты ошибок', () => {
  test('каждая ошибка сервера объяснена по-русски', () => {
    assert.match(chatErrorText(503), /не настроен/)
    assert.match(chatErrorText(429, 'daily limit'), /закончились/)
    assert.match(chatErrorText(429), /подожди минуту/)
    assert.match(chatErrorText(502), /не отвечает/)
    assert.match(chatErrorText(403), /токену/)
    assert.match(chatErrorText(400, 'message too long'), /2000/)
    assert.match(chatErrorText(500), /500/)
  })

  test('разметка ответа: жирное остаётся, звёздочки, решётки и таблицы убираются', () => {
    const l = parseReply('## Частицы\n**이/가** — подлежащее\n- со *звёздочкой* и **жирным**\n| a | b |\n|---|---|\n| 사과 | яблоко |')
    assert.equal(l.length, 5)
    assert.deepEqual(l[0].pieces, [{ text: 'Частицы', bold: false }])
    assert.deepEqual(l[1].pieces, [{ text: '이/가', bold: true }, { text: ' — подлежащее', bold: false }])
    assert.equal(l[2].bullet, true)
    assert.ok(!JSON.stringify(l).includes('*'))
    assert.ok(!JSON.stringify(l).includes('---'))
    assert.equal(l[4].pieces.map(p => p.text).join(''), '사과 · яблоко')
  })
})
