import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { pairTask, pairTasks } = await load('/src/data/korean/pairs.ts')
const { normalize } = await load('/src/stores/progress.ts')
const { D, similarWords } = await load('/src/data/korean/words.ts')
after(close)

describe('«похожие, но разные»', () => {
  test('неверные варианты — похожие слова, верный ответ среди вариантов, без повторов', () => {
    let made = 0
    for (const w of D.slice(0, 120)) {
      for (const reverse of [true, false]) {
        const t = pairTask(w, 0, reverse)
        if (!t) continue
        made++
        assert.ok(t.options.includes(t.answer))
        assert.equal(new Set(t.options).size, t.options.length)
        assert.ok(t.options.length >= 3 && t.options.length <= 4)
        const similarK = similarWords(w, 6).map(x => (reverse ? x.t : x.k))
        const wrong = t.options.filter(o => o !== t.answer)
        for (const o of wrong) assert.ok(similarK.some(s => s.includes(o) || o.includes(s.split(/ →| \(/)[0].trim())), `${o} не из похожих`)
      }
    }
    assert.ok(made > 100, 'заданий получилось мало')
  })

  test('набор: десять заданий на разные слова; слова с ошибками первыми', () => {
    const p = normalize({ v: 1 })
    const weak = D.slice(0, 5).map(d => d.k)
    for (const k of weak) p.words[k] = { ok: 0, bad: 3, streak: 0, last: 1 }
    const t = pairTasks(p, 10)
    assert.equal(t.length, 10)
    assert.equal(new Set(t.map(x => x.word)).size, 10)
    assert.deepEqual(t.map(x => x.id), t.map((_, i) => i))
    const hits = t.filter(x => weak.includes(x.word)).length
    assert.ok(hits >= 3, `слабых слов в наборе мало: ${hits}`)
  })
})
