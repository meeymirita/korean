// Тест по влогу: данные задания (один верный ответ, пропуски, порядок), выбор вопросов и пар, подсчёт.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const T = await load('/src/data/korean/vlog-test.ts')
const { passes } = await load('/src/data/korean/vlog-study.ts')
const { VLOGS } = await load('/src/data/korean/vlogs.ts')
after(close)

const firstOf = id => passes(VLOGS.find(v => v.id === id).lines).first

test('данные теста: вопросы, рассказ и события ссылаются на существующие фразы', () => {
  for (const [id, d] of Object.entries(T.VLOG_TEST)) {
    const first = passes(VLOGS.find(v => v.id === id).lines).first
    assert.ok(d.quiz.length >= T.QUIZ_SHOWN, 'в банке не меньше показываемого')
    for (const q of d.quiz) {
      assert.equal(new Set(q.options).size, 4, q.q)
      assert.ok(first[q.line], `${id}: нет фразы ${q.line}`)
    }
    assert.ok(d.story.to - d.story.from + 1 >= 5, 'рассказ от 5 фраз')
    assert.ok(first[d.story.to], 'конец рассказа есть')
    assert.ok(d.events.length >= 5 && d.events.every((e, i) => first[e.line] && (!i || e.line > d.events[i - 1].line)), 'события идут по времени')
  }
})

test('рассказ: каждое слово пропуска встречается в эпизоде ровно один раз и убирается', () => {
  for (const [id, d] of Object.entries(T.VLOG_TEST)) {
    const first = firstOf(id)
    const parts = T.storyLines(first, d.story)
    const gaps = parts.flat().filter(p => 'gap' in p).map(p => p.gap)
    assert.deepEqual([...gaps].sort(), d.story.gaps.map((_, i) => i), id)
    const text = parts.flat().map(p => ('gap' in p ? '' : p.t)).join('')
    for (const w of d.story.gaps) assert.ok(!text.includes(w), `${id}: слово ${w} осталось в тексте`)
    // слово встречается в эпизоде один раз (иначе пропуск неоднозначен)
    const episode = first.slice(d.story.from, d.story.to + 1).map(l => l.ko.split(' ').map(t => t.replace(/[.,?!]+$/, ''))).flat()
    for (const w of d.story.gaps) assert.equal(episode.filter(x => x === w).length, 1, `${id}: ${w}`)
  }
})

test('pickQuiz: нужное число вопросов, верный ответ перемешан правильно', () => {
  for (const d of Object.values(T.VLOG_TEST)) {
    const shown = T.pickQuiz(d.quiz)
    assert.equal(shown.length, T.QUIZ_SHOWN)
    for (const q of shown) {
      const src = d.quiz.find(b => b.q === q.q)
      assert.equal(q.options[q.correct], src.options[0])
      assert.deepEqual([...q.options].sort(), [...src.options].sort())
    }
  }
})

test('pickPairs: без дублей русского значения, мало слов — блока нет', () => {
  const words = Array.from({ length: 20 }, (_, i) => ({ k: `слово${i}`, t: `знач${i % 15}; ещё` }))
  const p = T.pickPairs(words)
  assert.ok(p.length >= T.PAIRS_MIN && p.length <= T.PAIRS_MAX)
  assert.equal(new Set(p.map(x => x.t)).size, p.length)
  assert.deepEqual(T.pickPairs(words.slice(0, 3)), [])
})

test('порядок и итог: баллы за верные места, проходной 80%', () => {
  assert.equal(T.orderScore([0, 1, 2, 3]), 4)
  assert.equal(T.orderScore([1, 0, 2, 3]), 2)
  const o = T.shuffledOrder(6)
  assert.ok(!o.every((e, i) => e === i))
  assert.equal([...o].sort().join(), '0,1,2,3,4,5')
  assert.equal(T.isPassed(24, 30), true)
  assert.equal(T.isPassed(23, 30), false)
  assert.equal(T.isPassed(0, 0), false)
})
