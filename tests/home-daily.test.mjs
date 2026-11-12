import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { homeDaily } = await load('/src/composables/useHome.ts')
after(close)

describe('главная раздела: правило и фразы одни на весь день', () => {
  test('в тот же день выбор не меняется, сколько ни обновляй', () => {
    const a = homeDaily('2026-11-12')
    const b = homeDaily('2026-11-12')
    assert.deepEqual(a, b)
    assert.equal(a.phrases.length, 2)
    assert.notEqual(a.phrases[0].ko, a.phrases[1].ko)
    assert.ok(a.rule.rule && a.rule.examples)
  })

  test('в другие дни выбор другой', () => {
    const days = Array.from({ length: 10 }, (_, i) => homeDaily(`2026-11-${10 + i}`))
    assert.ok(new Set(days.map(d => d.phrases[0].ko)).size > 3)
    assert.ok(new Set(days.map(d => d.rule.rule)).size > 1)
  })
})
