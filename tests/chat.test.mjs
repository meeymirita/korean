import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { chatErrorText } = await load('/src/lib/chat.ts')
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
})
