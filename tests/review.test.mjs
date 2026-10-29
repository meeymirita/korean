import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { intervalDays, dueWords, weekSummary } = await load('/src/data/review.ts')
const { normalize, dayKey, KNOWN_STREAK } = await load('/src/stores/progress.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const DAY = 86_400_000
const NOW = new Date(2026, 9, 30, 12, 0, 0)
const data = patch => normalize({ v: 1, ...patch })
const [A, B, C] = [D[0].k, D[1].k, D[2].k]

describe('intervalDays', () => {
  test('интервал растёт с серией и упирается в 30 дней', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(intervalDays), [0, 1, 3, 7, 14, 30])
    assert.equal(intervalDays(99), 30)
  })
})

describe('dueWords', () => {
  test('слово с серией 0 пора повторить сразу', () => {
    const p = data({ words: { [A]: { ok: 0, bad: 1, streak: 0, last: NOW.getTime() } } })
    assert.deepEqual(dueWords(p, NOW.getTime()).map(d => d.word.k), [A])
  })

  test('слово ждёт свой интервал', () => {
    const last = NOW.getTime() - 2 * DAY
    const p = data({ words: { [A]: { ok: 2, bad: 0, streak: 2, last } } })
    assert.equal(dueWords(p, NOW.getTime()).length, 0, 'серия 2 → ждать 3 дня')
    assert.equal(dueWords(p, NOW.getTime() + 2 * DAY).length, 1, 'через 4 дня пора')
  })

  test('сначала слова с ошибками, потом самые просроченные', () => {
    const t = NOW.getTime()
    const p = data({
      words: {
        [A]: { ok: 4, bad: 0, streak: 4, last: t - 100 * DAY },
        [B]: { ok: 1, bad: 2, streak: 1, last: t - 2 * DAY },
        [C]: { ok: 5, bad: 0, streak: 5, last: t - 31 * DAY },
      },
    })
    const out = dueWords(p, t)
    assert.deepEqual(out.map(d => d.word.k), [B, A, C])
    assert.deepEqual(out.map(d => d.reason), ['wrong', 'old', 'old'])
  })

  test('выученное слово с ошибками в прошлом считается просто давним', () => {
    const t = NOW.getTime()
    const p = data({ words: { [A]: { ok: 9, bad: 3, streak: KNOWN_STREAK, last: t - 30 * DAY } } })
    assert.equal(dueWords(p, t)[0].reason, 'old')
  })

  test('слова вне словаря и без ответов игнорируются', () => {
    const t = NOW.getTime()
    const p = data({
      words: {
        нетТакого: { ok: 0, bad: 3, streak: 0, last: t - 9 * DAY },
        [A]: { ok: 0, bad: 0, streak: 0, last: 0 },
      },
    })
    assert.equal(dueWords(p, t).length, 0)
  })
})

describe('weekSummary', () => {
  test('семь дней, последний — сегодня, подписи по дням недели', () => {
    const w = weekSummary(data({}), NOW)
    assert.equal(w.days.length, 7)
    assert.equal(w.days[6].key, dayKey(NOW))
    assert.equal(w.days[6].label, 'пт') // 30 октября 2026 — пятница
    assert.equal(w.days[0].label, 'сб')
  })

  test('пустая неделя: точность не считается, лучшего дня нет', () => {
    const w = weekSummary(data({}), NOW)
    assert.deepEqual([w.total, w.ok, w.accuracy, w.activeDays, w.bestDay], [0, 0, null, 0, null])
  })

  test('суммы, точность, лучший день и число активных дней', () => {
    const d1 = dayKey(new Date(NOW.getTime() - DAY))
    const d0 = dayKey(NOW)
    const w = weekSummary(data({ days: { [d1]: 8, [d0]: 3 }, all: { [d1]: 10, [d0]: 5 } }), NOW)
    assert.deepEqual([w.total, w.ok, w.accuracy, w.activeDays], [15, 11, 73, 2])
    assert.equal(w.bestDay.key, d1)
  })

  test('выученные за неделю: только свежие, новые первыми', () => {
    const t = NOW.getTime()
    const w = weekSummary(
      data({
        words: {
          [A]: { ok: 3, bad: 0, streak: 3, last: t, kd: t - 3 * DAY },
          [B]: { ok: 3, bad: 0, streak: 3, last: t, kd: t - DAY },
          [C]: { ok: 3, bad: 0, streak: 3, last: t, kd: t - 20 * DAY },
        },
      }),
      NOW,
    )
    assert.deepEqual(w.learned.map(x => x.k), [B, A])
  })
})
