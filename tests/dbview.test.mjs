import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { formatCell, isTimeColumn, rangeText } = await load('/src/data/dbView.ts')
after(close)

describe('показ значений таблицы', () => {
  test('время показывается датой, исходное число в подсказке', () => {
    const c = formatCell('t', Date.UTC(2026, 9, 30, 12, 0, 0))
    assert.match(c.text, /^\d\d\.\d\d\.\d\d, \d\d:\d\d:\d\d$/)
    assert.equal(c.title, String(Date.UTC(2026, 9, 30, 12, 0, 0)))
  })

  test('временные колонки узнаются по названию, обычные числа остаются числами', () => {
    for (const name of ['t', 'created', 'updated', 'expires', 'last', 'kd']) assert.equal(isTimeColumn(name), true, name)
    assert.deepEqual(formatCell('size', 123456), { text: '123456' })
    assert.deepEqual(formatCell('xp', 10), { text: '10' })
  })

  test('пусто, ноль и текст', () => {
    assert.deepEqual(formatCell('kd', null), { text: '—', muted: true })
    assert.deepEqual(formatCell('kd', 0), { text: '0' }, 'нулевое время — просто 0, не 1970 год')
    assert.deepEqual(formatCell('caption', ''), { text: '(пусто)', muted: true })
    assert.deepEqual(formatCell('word', '사람'), { text: '사람' })
  })

  test('подпись диапазона', () => {
    assert.equal(rangeText(0, 50, 320), '1–50 из 320')
    assert.equal(rangeText(50, 50, 320), '51–100 из 320')
    assert.equal(rangeText(300, 20, 320), '301–320 из 320')
    assert.equal(rangeText(0, 0, 0), '0 строк')
  })
})
