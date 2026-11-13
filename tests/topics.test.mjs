import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { topicProgress, topicWords, unlearnedWords, topicTasks, DRILL_SIZE } = await load('/src/data/korean/topics.ts')
const { normalize, KNOWN_STREAK } = await load('/src/stores/progress.ts')
const { CATN } = await load('/src/data/korean/words.ts')
const { EXTRA, STUDY } = await load('/src/data/korean/study.ts')
after(close)

const fresh = () => normalize({ v: 1 })
const stat = streak => ({ ok: streak, bad: 0, streak, last: Date.now() })
const topic = Object.keys(CATN).find(id => topicWords(id).length > DRILL_SIZE)

describe('прогресс по темам', () => {
  test('все темы словаря, слова только из STUDY, без выученных в новом прогрессе', () => {
    const list = topicProgress(fresh())
    assert.deepEqual(list.map(t => t.id), Object.keys(CATN))
    for (const t of list) {
      assert.equal(t.known, 0)
      assert.equal(t.pct, 0)
      assert.equal(t.total, topicWords(t.id).length)
      assert.ok(topicWords(t.id).every(d => !EXTRA.has(d.k) && d.c.includes(t.id)))
    }
    assert.ok(list.some(t => t.total > 0))
  })

  test('выучено при очках от KNOWN_STREAK, 4 очка ещё не выучено', () => {
    const [a, b, c] = topicWords(topic)
    const p = fresh()
    p.words[a.k] = stat(KNOWN_STREAK)
    p.words[b.k] = stat(KNOWN_STREAK + 3)
    p.words[c.k] = stat(KNOWN_STREAK - 1)
    const t = topicProgress(p).find(x => x.id === topic)
    assert.equal(t.known, 2)
    assert.equal(t.pct, Math.round((2 / t.total) * 100))
    assert.equal(unlearnedWords(p, topic).length, t.total - 2)
  })

  test('слова не из STUDY и чужих тем в подсчёт не идут', () => {
    const p = fresh()
    p.words['несуществующее'] = stat(9)
    for (const k of EXTRA) p.words[k] = stat(9)
    assert.ok(topicProgress(p).every(t => t.known === 0))
  })
})

describe('«Добить тему»', () => {
  test('серия только из не выученных слов темы, с верным ответом среди вариантов', () => {
    const p = fresh()
    const learned = topicWords(topic).slice(0, 5)
    for (const d of learned) p.words[d.k] = stat(KNOWN_STREAK)
    const names = new Set(learned.map(d => d.k))
    const inTopic = new Set(topicWords(topic).map(d => d.k))
    for (let i = 0; i < 10; i++) {
      const tasks = topicTasks(p, topic)
      assert.equal(tasks.length, DRILL_SIZE)
      assert.equal(new Set(tasks.map(t => t.word)).size, tasks.length)
      for (const t of tasks) {
        assert.ok(t.options.includes(t.answer))
        assert.ok(inTopic.has(t.word) && !names.has(t.word))
        assert.ok(STUDY.some(d => d.k === t.word))
      }
    }
  })

  test('сначала слова с меньшими очками', () => {
    const p = fresh()
    const [a, b] = topicWords(topic)
    for (const d of topicWords(topic)) p.words[d.k] = stat(3)
    p.words[a.k] = stat(0)
    p.words[b.k] = stat(1)
    const words = new Set(topicTasks(p, topic, 2).map(t => t.word))
    assert.deepEqual([...words].sort(), [a.k, b.k].sort())
  })

  test('все слова выучены: заданий нет, прогресс 100%', () => {
    const p = fresh()
    for (const d of topicWords(topic)) p.words[d.k] = stat(KNOWN_STREAK)
    assert.deepEqual(topicTasks(p, topic), [])
    const t = topicProgress(p).find(x => x.id === topic)
    assert.equal(t.pct, 100)
    assert.equal(t.known, t.total)
  })

  test('слов осталось меньше серии: заданий столько, сколько слов', () => {
    const p = fresh()
    const all = topicWords(topic)
    for (const d of all.slice(3)) p.words[d.k] = stat(KNOWN_STREAK)
    assert.equal(topicTasks(p, topic).length, 3)
  })
})
