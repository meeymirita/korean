import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { READ_QUESTIONS, SCENES, readTasks, sceneTasks } = await load('/src/data/korean/read.ts')
const { STORIES } = await load('/src/game/stories.ts')
const { EXCHANGES } = await load('/src/game/dialogs.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
after(close)

// «Чтение и диалоги»: вопросы по рассказам и сценки из проверенных реплик.
describe('рассказы: вопросы', () => {
  test('у каждого вопроса есть рассказ и предложение, верный ответ не повторяется среди неверных, вариантов четыре разных', () => {
    for (const r of READ_QUESTIONS) {
      const st = STORIES.find(s => s.id === r.story)
      assert.ok(st, `нет рассказа ${r.story}`)
      assert.ok(r.at >= 1 && r.at <= st.sents.length, `${r.story}: предложение ${r.at}`)
      assert.equal(new Set([r.a, ...r.wrong]).size, 4, `${r.q}: варианты повторяются`)
      assert.ok(r.q.endsWith('?'), r.q)
    }
  })
  test('вопросов по каждому рассказу не меньше одного, рассказов с вопросами не меньше восьми', () => {
    const by = new Set(READ_QUESTIONS.map(r => r.story))
    assert.ok(by.size >= 8, `рассказов ${by.size}`)
  })
  test('набор: восемь заданий, не больше двух по одному рассказу, ответ среди вариантов, рассказ в заголовке, предложение разбирается без неизвестных слов', () => {
    for (let i = 0; i < 5; i++) {
      const t = readTasks(8)
      assert.equal(t.length, 8)
      assert.equal(new Set(t.map(x => x.id)).size, 8)
      const per = {}
      for (const x of t) {
        assert.ok(x.options.includes(x.answer))
        assert.equal(x.options.length, 4)
        assert.ok(x.title.startsWith('Рассказ «') && x.title.includes('\n'))
        const story = x.title.split('\n')[0]
        per[story] = (per[story] ?? 0) + 1
        assert.ok(!analyze(x.sentence).some(s => s.type === 'unknown'), x.sentence)
      }
      assert.ok(Object.values(per).every(n => n <= 2))
    }
  })
})

describe('диалоги: сценки', () => {
  test('каждая реплика сценки есть в EXCHANGES, в сценке больше трёх реплик', () => {
    for (const s of SCENES) {
      assert.ok(s.asks.length >= 4, s.id)
      for (const a of s.asks) assert.ok(EXCHANGES.some(e => e[0] === a), `${s.id}: нет реплики «${a}»`)
    }
  })
  test('набор: ответ среди трёх разных вариантов, неверные от другой темы, прошлые реплики видны, подсказки про вопросы есть', () => {
    for (let i = 0; i < 5; i++) {
      const t = sceneTasks(2)
      assert.equal(t.length, 8)
      for (const x of t) {
        assert.equal(x.options.length, 3)
        assert.equal(new Set(x.options).size, 3)
        assert.ok(x.options.includes(x.answer))
        const ex = EXCHANGES.find(e => `— ${e[0]}` === x.prompt)
        assert.equal(x.answer, ex[2])
        for (const o of x.options.filter(o => o !== x.answer)) assert.ok(!EXCHANGES.some(e => e[2] === o && e[4] === ex[4]), `«${o}» той же темы, что верный ответ`)
        assert.ok(x.pairOf && x.options.every(o => x.pairOf[o]))
        assert.ok(x.title.startsWith('Диалог «'))
      }
      // у второй реплики сценки в заголовке видна первая
      const second = t.find(x => x.title.split('\n').length > 1)
      assert.ok(second.title.includes('— '))
    }
  })
})
