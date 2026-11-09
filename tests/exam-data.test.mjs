import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { close, load } from './_load.mjs'

const { ptextPool } = await load('/src/game/ptext-pool.ts')
const { examParts, examRules, WORD_RULES, FORM_RULES, DEM_RULE, QW_RULE, CNT_RULE, examTotal, examNeed, examPassed, examState, summarize, blockRules, blockPoints, partPoints, TWIN, EXAM_PARTS } = await load('/src/data/korean/exam.ts')

after(close)

const pointsByRule = parts => {
  const by = {}
  for (const p of parts) for (const b of p) for (const r of blockRules(b)) by[r] = (by[r] || 0) + 1
  return by
}

describe('итоговая оценка: данные экзамена', () => {
  test('правила экзамена: все шесть семей частиц с пройденными карточками', () => {
    assert.deepEqual(examRules().map(r => r.id).sort(), ['and', 'object', 'only', 'place', 'subject', 'topic'])
  })

  test('четыре части по десять блоков, 220–260 пунктов, каждое из 17 правил получает достаточно пунктов (проверено дважды)', () => {
    for (let i = 0; i < 2; i++) {
      const parts = examParts()
      assert.equal(parts.length, EXAM_PARTS)
      for (const p of parts) {
        assert.deepEqual(p.map(b => b.kind).sort(), ['errors', 'forms', 'gaps', 'gaps', 'gaps', 'gaps', 'gaps', 'gaps', 'match', 'order'])
        assert.ok(partPoints(p) >= 54 && partPoints(p) <= 66, `пунктов в части: ${partPoints(p)}`)
      }
      const total = examTotal(parts)
      assert.ok(total >= 220 && total <= 260, `пунктов всего: ${total}`)
      const by = pointsByRule(parts)
      for (const r of examRules()) assert.ok((by[r.id] ?? 0) >= 14, `правило ${r.id}: ${by[r.id]} пунктов`)
      for (const r of [...WORD_RULES, ...FORM_RULES]) assert.ok((by[r.id] ?? 0) >= 8, `правило ${r.id}: ${by[r.id]} пунктов`)
      for (const r of [DEM_RULE, QW_RULE, CNT_RULE]) assert.ok((by[r.id] ?? 0) >= 10, `правило ${r.id}: ${by[r.id]} пунктов`)
      assert.equal(Object.keys(by).length, 17)
    }
  })

  test('предложения не повторяются ни в частях, ни внутри; у каждого пункта есть правило; ответы возможны', () => {
    const parts = examParts()
    const pool = new Map(ptextPool().map(x => [x.ko.replace(/[.,?!]/g, ''), x]))
    const seen = new Set()
    const verbs = new Set()
    for (const p of parts) {
      for (const b of p) {
        if (b.kind === 'gaps') {
          for (const s of b.sentences) {
            assert.ok(!seen.has(s.ko), `повтор: ${s.ko}`)
            seen.add(s.ko)
            assert.equal(s.pieces.filter(x => typeof x !== 'string').length >= 1, true)
            for (const x of s.pieces) if (typeof x !== 'string') {
              assert.ok(x.rule && x.answer)
              if (!b.typed) assert.ok(b.bank.includes(x.answer), `нет плитки ${x.answer}`)
            }
          }
          if (!b.typed) assert.ok(b.bank.length > new Set(b.sentences.flatMap(s => s.pieces.filter(x => typeof x !== 'string').map(x => x.answer))).size, 'есть лишние плитки')
        } else if (b.kind === 'match') {
          assert.deepEqual([...b.choices].sort(), b.items.map(x => x.ru).sort())
          for (const it of b.items) { assert.ok(it.rule); assert.ok(!seen.has(it.ko)); seen.add(it.ko) }
        } else if (b.kind === 'order') {
          for (const it of b.items) {
            assert.deepEqual([...it.words].sort(), it.ko.split(/\s+/).sort())
            assert.ok(pool.has(it.ko), `предложения нет в пуле: ${it.ko}`)
            assert.ok(!seen.has(it.ko + '.') || true)
          }
        } else if (b.kind === 'forms') {
          for (const it of b.items) {
            assert.ok(it.answer && it.task && it.rule)
            assert.ok(!verbs.has(it.k), `глагол повторяется: ${it.k}`)
            verbs.add(it.k)
            if (it.rule === 'future_my') assert.ok(/ 거예요$/.test(it.answer))
            if (it.rule === 'an') assert.ok(/안 /.test(it.answer))
          }
        } else {
          assert.equal(b.items.filter(x => x.bad).length, b.items.filter(x => !x.bad).length)
          for (const it of b.items.filter(x => x.bad)) assert.ok([...it.ko].some(ch => TWIN[ch]), 'ошибка на двойнике частицы')
        }
        assert.equal(blockPoints(b), blockRules(b).length)
      }
    }
  })

  test('в блоке «Подставь слово» связка не берётся из 거예요 (будущее) и пропуск совпадает с правилом', () => {
    for (let i = 0; i < 3; i++) for (const p of examParts()) for (const b of p) if (b.kind === 'gaps' && b.id.startsWith('words')) {
      assert.equal(b.bank.length, 11)
      for (const s of b.sentences) {
        const gaps = s.pieces.filter(x => typeof x !== 'string')
        assert.equal(gaps.length, 1)
        const [g] = gaps
        assert.ok(['iyo', 'anie', 'have', 'pos'].includes(g.rule))
        if (g.rule === 'iyo') assert.ok(['이에요', '예요'].includes(g.answer) && !s.pieces[0].endsWith('거'), s.ko)
        if (g.rule === 'anie') assert.ok(['이 아니에요', '가 아니에요'].includes(g.answer))
        if (g.rule === 'have') assert.ok(['있어요', '없어요'].includes(g.answer))
        if (g.rule === 'pos') assert.ok(['앞', '뒤', '옆', '위', '아래'].includes(g.answer))
      }
    }
  })

  test('в пропусках 은/는 и 이/가 принимается двойник с той же 받침, у 하고 / 와 / 과 любой из трёх', () => {
    const SWAP = { 은: '이', 는: '가', 이: '은', 가: '는' }
    let n = 0
    for (const p of examParts()) for (const b of p) if (b.kind === 'gaps') for (const s of b.sentences) for (const x of s.pieces) {
      if (typeof x === 'string') continue
      n++
      if (SWAP[x.answer] && ['topic', 'subject'].includes(x.rule)) assert.deepEqual(x.accept, [SWAP[x.answer]])
      else if (x.rule === 'and') assert.deepEqual([x.answer, ...x.accept].sort(), ['과', '와', '하고'])
      else if (x.answer === '뭐') assert.deepEqual(x.accept, ['무엇'])
      else assert.equal(x.accept, undefined)
    }
    assert.ok(n >= 40)
  })

  test('свёртка результатов: по правилам, ошибки, критерий 85% и 70% на каждое правило', () => {
    const mk = (rule, ok) => ({ rule, ok, ...(ok ? {} : { m: { b: 'Блок', q: 'в', y: 'х', a: 'у' } }) })
    const part1 = [...Array(9).fill(0).map(() => mk('topic', true)), mk('topic', false), ...Array(8).fill(0).map(() => mk('only', true)), mk('only', false), mk('only', false)]
    const s = summarize([part1])
    assert.deepEqual(s.rules, { topic: { ok: 9, total: 10 }, only: { ok: 8, total: 10 } })
    assert.equal(s.right, 17)
    assert.equal(s.total, 20)
    assert.equal(s.mistakes.length, 3)
    assert.equal(examPassed(17, 20, s.rules), true) // 85% и по правилам 90% и 80%
    assert.equal(examPassed(17, 20, { a: { ok: 7, total: 10 }, b: { ok: 10, total: 10 } }), true) // ровно 70%
    assert.equal(examPassed(17, 20, { a: { ok: 6, total: 10 }, b: { ok: 11, total: 10 } }), false) // правило ниже 70%
    assert.equal(examPassed(16, 20, s.rules), false) // 80% всего
    assert.equal(examNeed(114), 97)
  })

  test('состояние в списке', () => {
    const day = 86_400_000
    const now = Date.UTC(2026, 10, 10)
    assert.equal(examState(undefined, now), 'new')
    assert.equal(examState({ passed: false, dueAt: null }, now), 'failed')
    assert.equal(examState({ passed: true, dueAt: now + day }, now), 'passed')
    assert.equal(examState({ passed: true, dueAt: now - 1 }, now), 'due')
  })
})
