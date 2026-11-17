import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS, checkReply } from '../scripts/voice-text-check.mjs'

// Проверки ответов в скрипте voice-text-check.mjs: плохие ответы ловятся, хорошие проходят (без сети).
const flags = (name, reply, i = 0) => checkReply(reply, i, SCENARIOS[name])

describe('voice-text-check: проверки ответов', () => {
  test('род, непройденное и «Верно!» на вопрос ловятся', () => {
    assert.ok(flags('position', 'Я выпила, извини.').some(f => f.includes('род')))
    assert.ok(flags('position', '책과 폰이 책상 위에 있어요.').some(f => f.includes('와/과')))
    assert.ok(flags('position', 'Верно! Скажи так.').some(f => f.includes('Верно')))
    assert.ok(flags('future', '먹을 거예요: поеду.').some(f => f.includes('ехать')))
  })
  test('слова на «과» вроде 사과 не считаются частицей', () => {
    assert.deepEqual(flags('future', '사과를 먹을 거예요. Буду есть яблоко.'), [])
  })
  test('сценка про новую тему: отказ и возврат к пройденному ловятся, хороший ответ чист', () => {
    assert.ok(flags('topic', 'Это уточни у учителя на субботнем уроке.').some(f => f.includes('отказ')))
    assert.ok(flags('topic', 'Хорошо, давай 학교: какую форму выберешь?', 1).some(f => f.includes('назад')))
    assert.deepEqual(flags('topic', 'С глаголами: основа + 는 것, например 먹는 것, «то, что едят». Это пока не пройдено.', 1), [])
  })
  test('шум: без переспроса замечание, с переспросом чисто', () => {
    assert.ok(flags('noise', 'Это значит «что это».').length > 0)
    assert.deepEqual(flags('noise', 'Не расслышал, скажи ещё раз.'), [])
  })
})
