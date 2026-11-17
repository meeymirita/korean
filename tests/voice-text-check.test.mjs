import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS, checkReply } from '../scripts/voice-text-check.mjs'

// Проверки ответов в скрипте voice-text-check.mjs: плохие ответы ловятся, хорошие проходят (без сети).
const flags = (name, reply, i = 0) => checkReply(reply, i, SCENARIOS[name])

describe('voice-text-check: проверки ответов', () => {
  test('род, непройденное и «Верно!» на вопрос ловятся', () => {
    assert.ok(flags('position', 'Я выпила, извини.').some(f => f.includes('род')))
    assert.ok(flags('position', 'Я не писал этого.').some(f => f.includes('род')))
    assert.ok(flags('position', '책과 폰이 책상 위에 있어요.').some(f => f.includes('와/과')))
    assert.ok(flags('position', 'Верно! Скажи так.').some(f => f.includes('Верно')))
    assert.ok(flags('future', '먹을 거예요: поеду.').some(f => f.includes('ехать')))
  })
  test('слова на «과» вроде 사과 и цитата ученика не считаются ошибкой', () => {
    assert.deepEqual(flags('future', '사과를 먹을 거예요. Буду есть яблоко.'), [])
    assert.ok(!flags('position', 'Ты сказал «있고 있다»: так не говорят.', 2).some(f => f.includes('-고')))
    assert.ok(flags('position', '먹고 가요.', 2).some(f => f.includes('-고')))
  })
  test('для голоса: таблица, чтение кириллицей и простыня ловятся', () => {
    assert.ok(flags('future', '| a | b |\n|---|---|\n| 앞 | ап |').some(f => f.includes('таблица')))
    assert.ok(flags('future', 'Читается ап.').some(f => f.includes('кириллицей')))
    assert.ok(flags('future', 'слово '.repeat(200)).some(f => f.includes('длинно')))
  })
  test('сценка про новую тему: отказ и возврат к пройденному ловятся, хороший ответ чист', () => {
    assert.ok(flags('topic', 'Это уточни у учителя на субботнем уроке.').some(f => f.includes('отказ')))
    assert.ok(flags('topic', 'Хорошо, давай 학교: какую форму выберешь?', 1).some(f => f.includes('назад')))
    assert.ok(flags('topic', 'Хочешь вернёмся к пройденному?', 1).some(f => f.includes('уйти с темы')))
    assert.deepEqual(flags('topic', 'С глаголами: основа + 는 것, например 먹는 것, «то, что едят». Это пока не пройдено.', 1), [])
  })
  test('шум: приветствие вместо переспроса ловится, «повторить слова» не засчитывается', () => {
    assert.ok(flags('noise', '안녕하세요! Чем помочь: повторить слова или проверить фразу?').length > 0)
    assert.deepEqual(flags('noise', 'Не расслышал, скажи ещё раз.'), [])
  })
})

describe('voice-text-check: двадцать сценариев', () => {
  test('сценариев не меньше пятнадцати, у каждого есть реплики, проверки и название', () => {
    const all = Object.entries(SCENARIOS)
    assert.ok(all.length >= 15 && all.length <= 25, `сценариев ${all.length}`)
    for (const [name, sc] of all) {
      assert.ok(sc.title && sc.say.length && sc.checks.length, name)
    }
  })

  test('на образце хорошего ответа нет замечаний, на образце плохого они есть', () => {
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      for (const [reply, i] of sc.good ?? []) assert.deepEqual(checkReply(reply, i, sc), [], `${name}: хороший образец не прошёл`)
      for (const [reply, i] of sc.bad ?? []) assert.ok(checkReply(reply, i, sc).length > 0, `${name}: плохой образец не пойман`)
    }
  })

  test('образцы есть у всех добавленных сценариев (кроме четырёх базовых)', () => {
    const base = new Set(['topic', 'position', 'noise', 'future'])
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      if (!base.has(name)) assert.ok(sc.good?.length && sc.bad?.length, `у ${name} нет образцов good и bad`)
    }
  })

  test('«Верно!» на фразу ученика разрешено, на вопрос нет', () => {
    assert.deepEqual(checkReply('Верно! 저는 학생이에요, я ученик.', 0, SCENARIOS.checkok), [])
    assert.ok(checkReply('Верно! Так и скажи.', 0, SCENARIOS.counter).some(f => f.includes('Верно')))
  })
})
