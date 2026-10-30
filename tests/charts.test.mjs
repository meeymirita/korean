import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { answersByDay, minutesByDay, topicShares, reviewForecast } = await load('/src/data/charts.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const NOW = new Date(2026, 9, 30, 15, 0)
const DAY = 86_400_000
const empty = () => ({ v: 1, updated: 0, xp: 0, days: {}, all: {}, time: {}, words: {}, sources: {}, log: [] })

describe('данные графиков', () => {
  test('ответы по дням: n дней, последний — сегодня, пропуски — нули', () => {
    const p = empty()
    p.all['2026-10-30'] = 10
    p.days['2026-10-30'] = 7
    p.all['2026-10-28'] = 3
    const a = answersByDay(p, 5, NOW)
    assert.equal(a.length, 5)
    assert.deepEqual(a.map(x => x.key), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])
    assert.deepEqual([a[4].all, a[4].ok, a[3].all, a[2].all], [10, 7, 0, 3])
    assert.equal(a[4].label, '30.10')
  })

  test('минуты: секунды округляются, сегодняшнее можно заменить живым значением', () => {
    const p = empty()
    p.time['2026-10-29'] = 90
    p.time['2026-10-30'] = 60
    const m = minutesByDay(p, 3, NOW)
    assert.deepEqual(m.map(x => x.value), [0, 2, 1])
    assert.equal(minutesByDay(p, 3, NOW, 600)[2].value, 10)
  })

  test('темы: доля выученных слов от 0 до 1', () => {
    const p = empty()
    const topic = Object.keys((D[0]).c.length ? { [D[0].c[0]]: 1 } : {})[0]
    for (const w of D.filter(d => d.c.includes(topic))) p.words[w.k] = { ok: 3, bad: 0, streak: 3, last: 1 }
    const t = topicShares(p)
    assert.equal(t.find(x => x.id === topic).share, 1)
    assert.ok(t.every(x => x.share >= 0 && x.share <= 1))
    assert.ok(t.some(x => x.share === 0))
  })

  test('прогноз: просроченное — в сегодня, остальное по дням, дальше недели не считаем', () => {
    const p = empty()
    const [a, b, c, d] = D
    const t = NOW.getTime()
    p.words[a.k] = { ok: 1, bad: 0, streak: 1, last: t - 5 * DAY } // срок вышел давно
    p.words[b.k] = { ok: 3, bad: 0, streak: 2, last: t } // через 3 дня
    p.words[c.k] = { ok: 9, bad: 0, streak: 5, last: t } // через 30 дней
    p.words[d.k] = { ok: 0, bad: 0, streak: 0, last: 0 } // без ответов
    const f = reviewForecast(p, 7, NOW)
    assert.equal(f.length, 7)
    assert.equal(f[0].label, 'сегодня')
    assert.deepEqual(f.map(x => x.value), [1, 0, 0, 1, 0, 0, 0])
  })
})
