import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { particleSets, particleTasks } = await load('/src/data/korean/particles.ts')
after(close)

describe('тренажёр частиц и окончаний', () => {
  test('наборы есть, у каждого не меньше трёх заданий, и среди них главные частицы', () => {
    const sets = particleSets()
    assert.ok(sets.length >= 3, `наборов мало: ${sets.length}`)
    for (const s of sets) assert.ok(s.count >= 3, s.id)
    const ids = sets.map(s => s.id)
    assert.ok(ids.includes('eun') || ids.includes('eul') || ids.includes('iga'), 'ни одной из основных частиц')
  })

  test('набор по правилу: все задания «вставь форму», верный ответ среди вариантов, ссылка на то же правило', () => {
    for (const s of particleSets()) {
      const t = particleTasks(s.id, 10)
      assert.ok(t.length >= 3 && t.length <= 10, s.id)
      for (const x of t) {
        assert.equal(x.gram, s.id)
        assert.ok(x.options.includes(x.answer))
        assert.ok(x.prompt.includes('＿＿＿'))
      }
      assert.deepEqual(t.map(x => x.id), t.map((_, i) => i))
    }
  })

  test('вперемешку: десять заданий из разных правил', () => {
    const t = particleTasks('', 10)
    assert.equal(t.length, 10)
    assert.ok(new Set(t.map(x => x.gram)).size >= 3)
  })

  test('неизвестное правило даёт пустой набор', () => {
    assert.deepEqual(particleTasks('нет-такого', 10), [])
  })
})
