import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { G } = await load('/src/data/korean/grammar.ts')
const { NOT_YET } = await load('/src/data/korean/notyet.ts')
after(close)

// «Не пройдено» (notyet.ts) не должно противоречить «пройдено» (карточки со st: 'ok'): иначе инструкции чата и голоса говорят разное.
describe('единый список пройденного', () => {
  test('ни одна тема из «не пройдено» не названа в пройденной карточке', () => {
    const passed = G.filter(g => g.st === 'ok')
    for (const n of NOT_YET) {
      for (const f of n.forms) {
        const hit = passed.find(g => g.ko.includes(f))
        assert.equal(hit, undefined, `«${n.label}» значится непройденной, но карточка «${hit?.ko}» отмечена пройденной: убери тему из notyet.ts`)
      }
    }
  })
  test('подписи тем непустые и без повторов', () => {
    const labels = NOT_YET.map(n => n.label)
    assert.ok(labels.every(l => l.trim().length > 5))
    assert.equal(new Set(labels).size, labels.length)
  })
})
