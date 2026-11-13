import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const m = await load('/src/data/korean/chain.ts')
const { STUDY } = await load('/src/data/korean/study.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const { chainWords, firstSyllableIndex, continuations, buildChain, chainTasks, firstSyllable, lastSyllable } = m
const study = new Set(STUDY.map(d => d.k))
const words = chainWords()
const idx = firstSyllableIndex(words)

describe('Цепочки слов', () => {
  test('слова только из STUDY, хангыль от двух слогов, без повторов', () => {
    assert.ok(words.length > 400)
    assert.equal(new Set(words.map(w => w.k)).size, words.length)
    for (const w of words) {
      assert.ok(study.has(w.k), w.k)
      assert.match(w.k, /^[가-힣]{2,}$/)
      assert.ok(w.t)
    }
    const extra = D.filter(d => !study.has(d.k)).map(d => d.k)
    for (const k of extra) assert.ok(!words.some(w => w.k === k), `EXTRA в цепочке: ${k}`)
  })

  test('индекс: первый слог каждого слова совпадает с ключом', () => {
    let n = 0
    for (const [s, list] of idx) for (const w of list) { assert.equal(firstSyllable(w.k), s); n++ }
    assert.equal(n, words.length)
  })

  test('на крошечных данных цепочка собирается без повторов, тупик не опорное слово', () => {
    const tiny = [{ k: '가수', t: 'a' }, { k: '수박', t: 'b' }, { k: '박수', t: 'c' }, { k: '수영', t: 'd' }, { k: '영수', t: 'e' }]
    const i = firstSyllableIndex(tiny)
    for (let n = 0; n < 20; n++) {
      const c = buildChain(i, 3)
      assert.equal(c.length, 4)
      assert.equal(new Set(c.map(w => w.k)).size, 4)
      c.slice(0, -1).forEach((w, j) => assert.equal(lastSyllable(w.k), firstSyllable(c[j + 1].k)))
    }
    assert.equal(buildChain(i, 10), null)
    assert.equal(chainTasks(10, tiny).length, 0)
  })

  test('серия: 12 заданий, 4 разных варианта, верный ровно один, цепочка связана и без повторов', () => {
    for (let n = 0; n < 40; n++) {
      const t = chainTasks(12)
      assert.equal(t.length, 12)
      assert.equal(new Set(t.map(x => x.prompt)).size, 12)
      t.forEach((x, i) => {
        assert.equal(x.id, i)
        assert.equal(x.options.length, 4)
        assert.equal(new Set(x.options).size, 4)
        assert.ok(x.options.includes(x.answer))
        const need = lastSyllable(x.prompt)
        assert.equal(x.options.filter(o => firstSyllable(o) === need).length, 1, `${x.prompt}: ${x.options}`)
        assert.equal(firstSyllable(x.answer), need)
        for (const o of x.options) assert.ok(study.has(o), o)
        assert.ok(x.note.includes(x.prompt) && x.note.includes(x.answer))
        assert.equal(x.word, undefined)
        // верное продолжение становится следующим опорным
        if (i + 1 < t.length) assert.equal(t[i + 1].prompt, x.answer)
        // опорное слово имеет продолжение в STUDY
        assert.ok(continuations(words.find(w => w.k === x.prompt), idx).length > 0)
      })
    }
  })

  test('цепочек хватает: слов с продолжением много, длинные цепочки находятся', () => {
    const anchors = words.filter(w => continuations(w, idx).length)
    assert.ok(anchors.length > 300)
    const starts = new Set()
    for (let n = 0; n < 60; n++) starts.add(buildChain(idx, 15)[0].k)
    assert.ok(starts.size > 20)
  })
})
