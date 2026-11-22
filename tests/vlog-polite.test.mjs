// «Три формы вежливости»: формы взяты из влога про эмоции, задания собираются верно.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const P = await load('/src/data/korean/vlog-polite.ts')
const { VLOGS } = await load('/src/data/korean/vlogs.ts')
after(close)

test('все формы есть в тексте влога sony-emotions', () => {
  const kos = new Set(VLOGS.find(v => v.id === 'sony-emotions').lines.map(l => l.ko))
  for (const e of P.EMOTIONS) for (const k of ['casual', 'polite', 'formal']) assert.ok(kos.has(e[k]), `нет «${e[k]}» во влоге`)
})

test('задания: три варианта, верный среди них, у каждого объяснение', () => {
  for (const e of P.EMOTIONS) for (const s of P.STYLES) {
    for (const t of [P.whoTask(e, s.id), P.styleTask(e, s.id)]) {
      assert.equal(t.options.length, 3)
      assert.equal(new Set(t.options.map(o => o.key)).size, 3)
      assert.ok(t.options.some(o => o.key === t.correct) && t.why.includes(P.STYLE_BY_ID[t.correct].ko))
    }
    const w = P.whoTask(e, s.id)
    assert.equal(w.options.find(o => o.key === w.correct).label, e[s.id])
  }
})

test('раунд: 10 заданий двух видов без повторов пары «чувство, форма»', () => {
  const r = P.politeRound(10)
  assert.equal(r.length, 10)
  assert.ok(r.some(t => t.kind === 'who') && r.some(t => t.kind === 'style'))
  assert.ok(P.politeRound(40).length <= P.EMOTIONS.length * 3)
})
