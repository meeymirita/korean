import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { weakLink, weakSpot } = await load('/src/data/charts.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

const NOW = Date.UTC(2026, 10, 17, 12)
const DAY = 86_400_000
const card = G.find(g => g.st === 'ok')
/** n ответов тренажёра по правилу карточки `id`, `bad` из них неверных, `ago` дней назад. */
const answers = (id, n, bad, ago) => Array.from({ length: n }, (_, i) => ({ t: NOW - ago * DAY, w: null, ok: i >= bad, s: 'trainer', d: { g: id } }))

// «Слабое место дня»: самое проваленное правило за неделю, иначе за месяц, иначе ничего.
describe('слабое место дня', () => {
  test('берёт правило с самой низкой точностью за неделю', () => {
    const other = G.filter(g => g.st === 'ok')[1]
    const log = [...answers(card.id, 10, 6, 2), ...answers(other.id, 10, 2, 3)]
    const w = weakSpot(log, NOW)
    assert.equal(w.days, 7)
    assert.equal(w.rule.id, `rule:${card.id}`)
    assert.equal(w.rule.accuracy, 40)
  })

  test('на неделе слабых нет: смотрит за месяц', () => {
    const w = weakSpot(answers(card.id, 10, 5, 20), NOW)
    assert.equal(w.days, 30)
    assert.equal(w.rule.id, `rule:${card.id}`)
  })

  test('слабых нет (мало ответов, нет ошибок, давно): null', () => {
    assert.equal(weakSpot([], NOW), null)
    assert.equal(weakSpot(answers(card.id, 2, 2, 1), NOW), null, 'меньше трёх ответов')
    assert.equal(weakSpot(answers(card.id, 10, 0, 1), NOW), null, 'ошибок нет')
    assert.equal(weakSpot(answers(card.id, 10, 5, 45), NOW), null, 'старше 30 дней')
  })

  test('ссылка ведёт на правило карточки, на тексты семейства или на игру режима', () => {
    assert.deepEqual(weakLink({ id: 'rule:eun' }), { path: '/game/home', query: { game: 'rule', g: 'eun' } })
    assert.deepEqual(weakLink({ id: 'mode:part', family: 'all' }), { path: '/game/home', query: { game: 'ptext', fam: 'all' } })
    assert.deepEqual(weakLink({ id: 'mode:num', game: 'num' }), { path: '/game/home', query: { game: 'num' } })
    assert.deepEqual(weakLink({ id: 'mode:x' }), { path: '/game/home', query: { game: 'rule' } })
  })
})
