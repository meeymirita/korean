// Правила прогресса живут в двух местах: на сайте (stores/progress.ts, сразу показывает результат) и на сервере (база).
// Этот тест прогоняет одну и ту же последовательность ответов через оба и требует одинакового результата.
import { after, describe, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { close, load, stubLocalStorage } from './_load.mjs'
import { OWNER, cleanup, start } from './_server.mjs'

stubLocalStorage()
const { useProgressStore, dayKey } = await load('/src/stores/progress.ts')
after(async () => {
  await close()
  await cleanup()
})

/** Одинаковая «случайность» при каждом запуске. */
function lcg(seed) {
  let x = seed
  return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296
}

describe('сайт и сервер считают прогресс одинаково', () => {
  test('300 ответов за несколько дней: слова, серии, выученное, дни, очки, источники', async () => {
    const rand = lcg(42)
    const words = ['사람', '학교', '친구', '물', '책', '집', '가다', '먹다']
    const sources = ['game', 'trainer', 'today', 'review']
    const base = new Date(2026, 9, 1, 10, 0, 0).getTime()
    const steps = Array.from({ length: 300 }, (_, i) => ({
      t: base + Math.floor(i / 60) * 86_400_000 + (i % 60) * 60_000, // 5 дней по 60 ответов
      word: rand() < 0.1 ? null : words[Math.floor(rand() * words.length)],
      ok: rand() < 0.7,
      source: sources[Math.floor(rand() * sources.length)],
      xp: [10, 15, 20][Math.floor(rand() * 3)],
    }))

    // сайт: стор без токена (чисто локально), время подставляем по шагам
    setActivePinia(createPinia())
    const store = useProgressStore()
    mock.timers.enable({ apis: ['Date'], now: steps[0].t })
    for (const s of steps) {
      mock.timers.setTime(s.t)
      store.record({ word: s.word, ok: s.ok, source: s.source, xp: s.xp })
    }
    mock.timers.reset()

    // сервер: те же ответы действиями
    const server = await start()
    const ops = steps.map(s => ({ type: 'answer', t: s.t, day: dayKey(new Date(s.t)), word: s.word, ok: s.ok, source: s.source, xp: s.xp }))
    for (let i = 0; i < ops.length; i += 100) assert.equal((await server.call('POST', '/api/ops', OWNER, { ops: ops.slice(i, i + 100) })).status, 200)
    const remote = await (await server.call('GET', '/api/progress', OWNER)).json()
    const local = JSON.parse(JSON.stringify(store.data))

    assert.equal(remote.xp, local.xp, 'очки')
    assert.deepEqual(remote.days, local.days, 'верные по дням')
    assert.deepEqual(remote.all, local.all, 'все ответы по дням')
    assert.deepEqual(remote.words, local.words, 'слова: верно, неверно, серия, последний ответ, когда выучено')
    assert.deepEqual(remote.sources, local.sources, 'источники')
    assert.deepEqual(remote.log, local.log, 'журнал последних ответов')
    assert.ok(Object.values(local.words).some(w => w.kd), 'в последовательности есть выученные слова')
    assert.ok(Object.keys(local.days).length >= 5, 'несколько разных дней')
  })
})
