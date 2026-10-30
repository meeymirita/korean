import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { quickTasks, QUICK_SIZE } = await load('/src/data/korean/quick.ts')
const { normalize } = await load('/src/stores/progress.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const now = Date.UTC(2026, 9, 30, 12)
const fresh = () => normalize({ v: 1 })
const withWeak = words => {
  const p = fresh()
  for (const k of words) p.words[k] = { ok: 1, bad: 3, streak: 0, last: now - 5 * 86_400_000 }
  return p
}

describe('режим «5 минут»', () => {
  test('всегда десять заданий с вариантами и верным ответом среди них', () => {
    for (let i = 0; i < 20; i++) {
      const t = quickTasks(fresh(), QUICK_SIZE, now)
      assert.equal(t.length, QUICK_SIZE)
      for (const x of t) {
        assert.ok(x.options.includes(x.answer), `${x.kind}: ответа нет среди вариантов`)
        assert.ok(x.prompt)
      }
    }
  })

  test('номера заданий подряд и без повторов, одинаковых вопросов нет', () => {
    const t = quickTasks(fresh(), QUICK_SIZE, now)
    assert.deepEqual(t.map(x => x.id).sort((a, b) => a - b), [...Array(QUICK_SIZE).keys()])
    assert.equal(new Set(t.map(x => x.kind + '|' + x.prompt)).size, t.length)
  })

  test('слова с ошибками попадают в набор первыми', () => {
    const weak = D.slice(0, 4).map(d => d.k)
    const p = withWeak(weak)
    for (let i = 0; i < 10; i++) {
      const t = quickTasks(p, QUICK_SIZE, now)
      const hit = t.filter(x => x.word && weak.includes(x.word))
      assert.ok(hit.length >= 3, `слабых слов в наборе мало: ${hit.length}`)
    }
  })

  test('есть задание на правило', () => {
    assert.ok(quickTasks(fresh(), QUICK_SIZE, now).some(x => x.kind === 'rule'))
  })
})
