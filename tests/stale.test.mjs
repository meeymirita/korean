import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { staleWords, staleTasks, weakWords, topicOrAll, STALE_DAYS, STALE_DRILL } = await load('/src/data/korean/stale.ts')
const { normalize, KNOWN_STREAK } = await load('/src/stores/progress.ts')
const { STUDY, EXTRA } = await load('/src/data/korean/study.ts')
const { CATN } = await load('/src/data/korean/words.ts')
const { EXTRA_MODES } = await load('/src/data/report.ts')
after(close)

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 13, 12)
const fresh = () => normalize({ v: 1 })
const set = (p, k, o) => (p.words[k] = { ok: 1, bad: 0, streak: 1, last: NOW, ...o })
const keys = STUDY.slice(0, 30).map(d => d.k)

describe('давно не видел', () => {
  test('порог строго больше 30 дней, без ответов и без last слово не входит, выученные входят', () => {
    const p = fresh()
    set(p, keys[0], { last: NOW - 31 * DAY })
    set(p, keys[1], { last: NOW - STALE_DAYS * DAY }) // ровно 30: ещё не давно
    set(p, keys[2], { last: NOW - 90 * DAY, streak: KNOWN_STREAK, ok: 5 }) // выучено
    set(p, keys[3], { last: 0 }) // никогда
    set(p, keys[4], { last: NOW - 60 * DAY, ok: 0, bad: 0, streak: 0 }) // нет ответов
    const r = staleWords(p, NOW)
    assert.deepEqual(r.map(x => x.d.k), [keys[2], keys[0]])
    assert.equal(r[0].days, 90)
    assert.equal(r[0].w.streak, KNOWN_STREAK)
  })

  test('самые давние первыми, слова не из STUDY и «дополнительные» не идут', () => {
    const p = fresh()
    set(p, keys[5], { last: NOW - 40 * DAY })
    set(p, keys[6], { last: NOW - 100 * DAY })
    set(p, keys[7], { last: NOW - 70 * DAY })
    set(p, 'несуществующее', { last: 1 })
    for (const k of EXTRA) set(p, k, { last: 1 })
    assert.deepEqual(staleWords(p, NOW).map(x => x.d.k), [keys[6], keys[7], keys[5]])
    assert.deepEqual(staleWords(fresh(), NOW), [])
  })

  test('серия «Повторить их»: не больше 15 заданий из давних слов; режим stale назван', () => {
    const p = fresh()
    for (const k of keys) set(p, k, { last: NOW - 45 * DAY })
    const tasks = staleTasks(p, NOW)
    assert.ok(tasks.length > 0 && tasks.length <= STALE_DRILL)
    assert.equal(STALE_DRILL, 15)
    assert.deepEqual(staleTasks(fresh(), NOW), [])
    assert.equal(EXTRA_MODES.stale, 'Давно не видел')
  })
})

describe('слабые слова по теме', () => {
  const topic = Object.keys(CATN).find(id => STUDY.filter(d => d.c.includes(id)).length >= 2)
  const inTopic = STUDY.filter(d => d.c.includes(topic)).map(d => d.k)
  const other = STUDY.find(d => !d.c.includes(topic)).k

  test('«Все» и тема: выученные и без ошибок не показываются, чужая тема отфильтрована', () => {
    const p = fresh()
    set(p, inTopic[0], { ok: 0, bad: 3, streak: 0 })
    set(p, inTopic[1], { ok: 0, bad: 1, streak: KNOWN_STREAK }) // выучено
    set(p, other, { ok: 0, bad: 2, streak: 0 })
    assert.ok(weakWords(p, '').some(x => x.d.k === other))
    assert.ok(!weakWords(p, '').some(x => x.d.k === inTopic[1]))
    assert.deepEqual(weakWords(p, topic).map(x => x.d.k).filter(k => k === inTopic[0] || k === other), [inTopic[0]])
  })

  test('сортировка по «минусу», лимит, слова только из STUDY', () => {
    const p = fresh()
    set(p, keys[0], { ok: 0, bad: 1, streak: 0 })
    set(p, keys[1], { ok: 0, bad: 4, streak: 0 })
    set(p, 'несуществующее', { ok: 0, bad: 9, streak: 0 })
    assert.deepEqual(weakWords(p, '').map(x => x.d.k), [keys[1], keys[0]])
    assert.equal(weakWords(p, '', 1).length, 1)
  })

  test('topicOrAll: известная тема остаётся, мусор даёт «Все»', () => {
    assert.equal(topicOrAll(topic), topic)
    assert.equal(topicOrAll('нет такой'), '')
    assert.equal(topicOrAll(5), '')
  })
})
