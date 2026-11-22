// Срезы по влогам: охват и недостающие слова, ядро слов, разговорник по ситуациям, шаблоны фраз.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const L = await load('/src/data/korean/vlog-lang.ts')
const { VLOGS } = await load('/src/data/korean/vlogs.ts')
after(close)

const hobby = VLOGS.find(v => v.id === 'choisusu-hobby')

test('охват: доля знакомых слов от 0 до 100, слов с повторами больше нуля', () => {
  for (const v of VLOGS.slice(0, 8)) {
    const c = L.coverageOf(v)
    assert.ok(c.total > 0 && c.pct >= 0 && c.pct <= 100 && c.known <= c.total, v.id)
  }
})

test('недостающие слова: список самых частых, цель достигается, порядок по убыванию', () => {
  const m = L.missingFor(hobby, 0.9)
  assert.ok(m.pct >= 0 && m.pct <= 100)
  for (let i = 1; i < m.list.length; i++) assert.ok(m.list[i - 1].n >= m.list[i].n)
  assert.ok(m.list.every(x => !x.word.own))
  assert.equal(m.reached, true)
  assert.deepEqual(L.missingFor(hobby, 0).list, [])
})

test('ядро слов: в скольких влогах звучит, по убыванию', () => {
  const c = L.coreWords(3)
  assert.ok(c.length > 20)
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].vlogs >= c[i].vlogs)
  assert.ok(c.every(x => x.vlogs >= 3))
  assert.ok(L.coreWords(20).length < c.length)
})

test('разговорник: ситуации с фразами нужной длины, без повторов, с влогами вперемешку', () => {
  for (const s of L.SCENES) {
    const p = L.sceneChunk(s, 12)
    const kos = p.map(x => x.ko)
    assert.equal(new Set(kos).size, kos.length, s.id)
    assert.ok(p.every(x => x.ko.length >= 6 && x.ko.length <= 26 && s.keys.some(k => x.ko.includes(k))), s.id)
  }
  assert.ok(L.sceneChunk(L.SCENES[0], 12).length >= 3, 'кафе: есть фразы')
  const all = L.sceneChunk(L.SCENES[0], 12)
  const strict = L.sceneChunk(L.SCENES[0], 12, 0.75)
  assert.ok(strict.every(x => x.known >= 0.75) && strict.length <= all.length + 12)
})

test('шаблоны: каркас находит примеры, в которых подсвеченный кусок есть во фразе', () => {
  for (const p of L.PATTERNS) {
    const ex = L.patternExamples(p, 5)
    assert.ok(ex.length >= 1, `у шаблона ${p.id} нет примеров`)
    for (const e of ex) assert.ok(e.ko.includes(e.mark) && p.re.test(e.ko), p.id)
  }
})
