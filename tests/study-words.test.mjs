import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { EXTRA, EXTRA_SENTENCES, STUDY, STUDY_TRANSLATIONS } = await load('/src/data/korean/study.ts')
const { D } = await load('/src/data/korean/words.ts')
const { pool } = await load('/src/data/korean/trainer.ts')
const { randomWords } = await load('/src/data/korean/tasks.ts')
const { SYLLABLE_WORDS } = await load('/src/data/korean/syllables.ts')
const { ptextPool } = await load('/src/game/ptext-pool.ts')
after(close)

describe('«дополнительные» слова не идут в задания', () => {
  test('каждое слово списка есть в словаре; словарь для заданий короче ровно на них', () => {
    const known = new Set(D.map(d => d.k))
    for (const k of EXTRA) assert.ok(known.has(k), `нет в словаре: ${k}`)
    assert.equal(STUDY.length, D.length - EXTRA.size)
    assert.ok(STUDY.every(d => !EXTRA.has(d.k)))
  })

  test('примеры этих слов убраны из предложений для заданий, остальные на месте', () => {
    assert.ok(EXTRA_SENTENCES.size > 0)
    for (const s of EXTRA_SENTENCES) assert.ok(!(s in STUDY_TRANSLATIONS), s)
    for (const d of STUDY) assert.ok(!EXTRA_SENTENCES.has(d.s), d.s)
  })

  test('тренажёры, «Сегодня», слоги и пул текстов их не дают', () => {
    for (const w of pool('')) assert.ok(!EXTRA.has(w.k), w.k)
    for (const w of pool('example')) assert.ok(!EXTRA.has(w.k), w.k)
    for (const w of pool('sent')) assert.ok(!EXTRA_SENTENCES.has(w.k), w.k)
    for (const w of SYLLABLE_WORDS) assert.ok(!EXTRA.has(w.k), w.k)
    for (let i = 0; i < 30; i++) for (const w of randomWords(20)) assert.ok(!EXTRA.has(w.k), w.k)
    for (const x of ptextPool()) assert.ok(!EXTRA_SENTENCES.has(x.ko), x.ko)
  })
})
