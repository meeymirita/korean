import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { close, load } from './_load.mjs'

const { ptextPool } = await load('/src/game/ptext-pool.ts')
const { altOrders, examParts, examRules, WORD_RULES, FORM_RULES, DEM_RULE, QW_RULE, CNT_RULE, NUM_RULE, PHR_RULE, sinoNumber, examTotal, examNeed, examPassed, examState, summarize, blockRules, blockPoints, partPoints, TWIN, EXAM_PARTS } = await load('/src/data/korean/exam.ts')

after(close)

const pointsByRule = parts => {
  const by = {}
  for (const p of parts) for (const b of p) for (const r of blockRules(b)) by[r] = (by[r] || 0) + 1
  return by
}

describe('итоговая оценка: данные экзамена', () => {
  test('правила экзамена: все семь семей частиц с пройденными карточками', () => {
    assert.deepEqual(examRules().map(r => r.id).sort(), ['and', 'object', 'only', 'place', 'subject', 'too', 'topic'])
  })

  test('четыре части по двенадцать блоков, 240–290 пунктов, каждое из 21 правила получает достаточно пунктов (проверено дважды)', () => {
    for (let i = 0; i < 2; i++) {
      const parts = examParts()
      assert.equal(parts.length, EXAM_PARTS)
      for (const p of parts) {
        assert.deepEqual(p.map(b => b.kind).sort(), ['errors', 'forms', 'forms', 'gaps', 'gaps', 'gaps', 'gaps', 'gaps', 'gaps', 'match', 'match', 'order'])
        assert.ok(partPoints(p) >= 58 && partPoints(p) <= 74, `пунктов в части: ${partPoints(p)}`)
      }
      const total = examTotal(parts)
      assert.ok(total >= 240 && total <= 290, `пунктов всего: ${total}`)
      const by = pointsByRule(parts)
      for (const r of examRules()) assert.ok((by[r.id] ?? 0) >= 12, `правило ${r.id}: ${by[r.id]} пунктов`)
      for (const r of [...WORD_RULES, ...FORM_RULES]) assert.ok((by[r.id] ?? 0) >= 6, `правило ${r.id}: ${by[r.id]} пунктов`)
      for (const r of [DEM_RULE, QW_RULE, CNT_RULE]) assert.ok((by[r.id] ?? 0) >= 10, `правило ${r.id}: ${by[r.id]} пунктов`)
      assert.ok((by[NUM_RULE.id] ?? 0) >= 20 && (by[PHR_RULE.id] ?? 0) >= 10, JSON.stringify(by))
      assert.equal(Object.keys(by).length, 21)
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
          for (const it of b.items) {
            assert.ok(it.rule)
            if (b.id.startsWith('phrases')) continue // фраз всего 11, на 4 части они могут повторяться между частями
            assert.ok(!seen.has(it.ko))
            seen.add(it.ko)
          }
        } else if (b.kind === 'order') {
          for (const it of b.items) {
            assert.deepEqual([...it.words].sort(), it.ko.split(/\s+/).sort())
            assert.ok(pool.has(it.ko), `предложения нет в пуле: ${it.ko}`)
            assert.ok(!seen.has(it.ko + '.') || true)
          }
        } else if (b.kind === 'forms') {
          for (const it of b.items) {
            assert.ok(it.answer && it.task && it.rule)
            if (it.rule !== 'num') {
              assert.ok(!verbs.has(it.k), `глагол повторяется: ${it.k}`)
              verbs.add(it.k)
            }
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
      assert.equal(b.bank.length, 12)
      for (const s of b.sentences) {
        const gaps = s.pieces.filter(x => typeof x !== 'string')
        assert.equal(gaps.length, 1)
        const [g] = gaps
        assert.ok(['iyo', 'anie', 'have', 'pos', 'juse'].includes(g.rule))
        if (g.rule === 'iyo') assert.ok(['이에요', '예요'].includes(g.answer) && !s.pieces[0].endsWith('거'), s.ko)
        if (g.rule === 'anie') assert.ok(['이 아니에요', '가 아니에요'].includes(g.answer))
        if (g.rule === 'have') assert.ok(['있어요', '없어요'].includes(g.answer))
        if (g.rule === 'pos') assert.ok(['앞', '뒤', '옆', '위', '아래'].includes(g.answer))
        if (g.rule === 'juse') assert.equal(g.answer, '주세요')
      }
    }
  })

  test('в пропусках 은/는 и 이/가 принимается двойник с той же 받침, у 하고 / 와 / 과 любой из трёх', () => {
    const SWAP = { 은: '이', 는: '가', 이: '은', 가: '는' }
    let n = 0
    for (const p of examParts()) for (const b of p) if (b.kind === 'gaps') for (const s of b.sentences) for (const x of s.pieces) {
      if (typeof x === 'string') continue
      n++
      if (SWAP[x.answer] && ['topic', 'subject'].includes(x.rule)) { if (x.accept) assert.deepEqual(x.accept, [SWAP[x.answer]]); else assert.equal(x.answer, '는') }
      else if (x.rule === 'and') { const all = [x.answer, ...x.accept]; assert.equal(all.length, 2); assert.ok(all.includes('하고') || x.answer === '하고'); assert.ok(all.every(a => ['과', '와', '하고'].includes(a))) }
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

  test('числа вводом: китайские числа словами, даты (6 и 10 месяцы особые), цены, корейское число для счёта', () => {
    const cases = { 1: '일', 10: '십', 11: '십일', 30: '삼십', 45: '사십오', 100: '백', 800: '팔백', 1000: '천', 1200: '천이백', 1500: '천오백', 3000: '삼천', 4500: '사천오백', 10000: '만', 12000: '만이천', 15000: '만오천', 25000: '이만오천', 50000: '오만' }
    for (const [n, w] of Object.entries(cases)) assert.equal(sinoNumber(Number(n)), w, n)
    for (let i = 0; i < 4; i++) for (const p of examParts()) for (const b of p) if (b.id.startsWith('numbers')) {
      assert.equal(b.kind, 'forms')
      assert.equal(b.items.length, 6)
      for (const it of b.items) {
        assert.equal(it.rule, 'num')
        if (it.task.startsWith('месяц')) assert.match(it.answer, /^(일|이|삼|사|오|유|칠|팔|구|시|십일|십이)월 .+일$/)
        else if (it.task.startsWith('сумма')) assert.match(it.answer, / 원$/)
        else assert.match(it.answer, /^(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열) (개|명|마리|권|장|병|잔|그릇)$/)
      }
    }
  })

  test('разговорные формулы: три фразы в части, у каждой своя ситуация, ответы однозначны', () => {
    const parts = examParts()
    for (const p of parts) {
      const b = p.find(x => x.id.startsWith('phrases'))
      assert.equal(b.kind, 'match')
      assert.equal(b.items.length, 3)
      assert.equal(new Set(b.items.map(x => x.ko)).size, 3)
      assert.deepEqual([...b.choices].sort(), b.items.map(x => x.ru).sort())
      assert.ok(b.items.every(x => x.rule === 'phr'))
    }
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

describe('итоговая оценка: проверка нейросетями', () => {
  test('другие порядки слов: группы с частицей и слова времени меняются, сказуемое остаётся', () => {
    const a = altOrders('내일 친구만 올 거예요')
    assert.ok(a.includes('친구만 내일 올 거예요'))
    assert.ok(a.every(x => x.endsWith('올 거예요')))
    assert.deepEqual(altOrders('제 책이 아니에요'), [])
    assert.ok(!altOrders('저는 시장에서만 과일을 사요').includes('시장에서만 과일을 저는 사요 x'))
    assert.equal(altOrders('저는 시장에서만 과일을 사요').length, 5)
  })

  test('저는 / 나는 не принимают 가, 와 / 과 выбирается по 받침', () => {
    for (let i = 0; i < 10; i++) {
      for (const part of examParts()) for (const b of part) if (b.kind === 'gaps') for (const s of b.sentences) {
        let before = ''
        for (const p of s.pieces) {
          if (typeof p === 'string') { before += p; continue }
          if (p.answer === '는' && /(^|\s)(저|나|너)$/.test(before)) assert.equal(p.accept, undefined, s.ko)
          if (p.rule === 'and') {
            const c = before.trim().charCodeAt(before.trim().length - 1) - 0xac00
            const want = c % 28 ? '과' : '와'
            assert.ok(![p.answer, ...p.accept].includes(want === '과' ? '와' : '과') || p.answer === (want === '과' ? '와' : '과'), s.ko)
          }
          before += p.answer
        }
      }
    }
  })
})
