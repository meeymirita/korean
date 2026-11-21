import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { VLOGS, lineAt, checkVlog, YT_ID } = await load('/src/data/korean/vlogs.ts')
const { VLOG_PLAN } = await load('/src/data/korean/vlog-plan.ts')
const { grammarHints, gramCard, gramState, gramById, finalOf } = await load('/src/data/korean/vlog-grammar.ts')

after(close)

const lines = [
  { s: 1, e: 3, ko: '안녕하세요', ru: 'Здравствуйте' },
  { s: 3, e: 6, ko: '저는 학생이에요', ru: 'Я студент' },
  { s: 8, e: 9, ko: '감사합니다', ru: 'Спасибо' },
]

test('lineAt: идущая фраза по времени', () => {
  assert.equal(lineAt(lines, 0), -1)
  assert.equal(lineAt(lines, 1), 0)
  assert.equal(lineAt(lines, 5.9), 1)
  assert.equal(lineAt(lines, 7), 1)
  assert.equal(lineAt(lines, 100), 2)
  assert.equal(lineAt([], 5), -1)
})

test('checkVlog находит ошибки данных', () => {
  const ok = { id: 'a', yt: 'dQw4w9WgXcQ', title: 't', channel: 'c', note: 'n', lines }
  assert.deepEqual(checkVlog(ok), [])
  assert.ok(checkVlog({ ...ok, yt: 'короткий' }).length)
  assert.ok(checkVlog({ ...ok, lines: [{ s: 2, e: 2, ko: '가', ru: 'идти' }] }).length)
  assert.ok(checkVlog({ ...ok, lines: [lines[1], lines[0]] }).length)
  assert.ok(checkVlog({ ...ok, lines: [{ s: 0, e: 1, ko: '', ru: 'x' }] }).length)
})

test('все влоги на сайте без ошибок, id уникальны', () => {
  const ids = new Set()
  for (const v of VLOGS) {
    assert.deepEqual(checkVlog(v), [], v.id)
    assert.ok(YT_ID.test(v.yt))
    assert.ok(!ids.has(v.id))
    ids.add(v.id)
  }
})

const ids = ko => grammarHints(ko).map(h => h.id)

test('грамматика во фразе: будущее, прошедшее, -러, -고, частицы', () => {
  assert.deepEqual(ids('혼자 갈 거예요'), ['future_my'])
  assert.deepEqual(ids('북촌에서 전시도 보고 맛있는 것도 먹고 여기 저기 구경할 거예요'), ['eseo', 'next_go', 'future_my'])
  assert.deepEqual(ids('음식이 나왔어요'), ['past_my'])
  assert.deepEqual(ids('점심을 먹으러 식당에 가요'), ['b14_reo', 'gada'])
  assert.deepEqual(ids('전시도 보고 싶어요'), ['gosipda'])
  assert.deepEqual(ids('재림이에요'), ['iyo'])
  assert.deepEqual(ids('감사합니다'), ['mnida'])
})

test('грамматика во фразе: ложных срабатываний нет', () => {
  assert.deepEqual(ids('맛있어요'), [])
  assert.deepEqual(ids('그리고 여러분'), [])
  assert.deepEqual(ids('안녕하세요 여러분'), ['b9_se'])
  assert.deepEqual(ids('저 혼자'), [])
  assert.deepEqual(ids('멤버십에 가입하면'), [])
  assert.deepEqual(ids('맛이 난다고 해요'), [])
  assert.deepEqual(ids('댓글까지 잊지 마세요'), ['b9_ji'])
  assert.deepEqual(ids(''), [])
  assert.equal(finalOf('갈'), 8)
  assert.equal(finalOf('했'), 20)
  assert.equal(finalOf('a'), -1)
})

test('каждая тема из правил есть в карточках; карточка даёт состояние и текст без разметки', () => {
  const sample = ['혼자 갈 거예요', '나왔어요', '먹으러 가요', '볼까요', '먹고', '먹고 싶어요', '안녕하세요', '북촌에서', '식당에 가요', '재림이에요', '주세요', '감사합니다', '좋지만', '예쁘네요', '그렇지요', '월요일부터', '잊지 마세요']
  for (const s of sample) for (const h of grammarHints(s)) assert.ok(gramById(h.id), h.id)
  const c = gramCard('future_my')
  assert.equal(c.state, 'ok')
  assert.ok(c.formula && !c.formula.includes('{'))
  assert.ok(c.example.ko && !c.example.ko.includes('{'))
  assert.equal(gramCard('b14_reo').state, 'ahead')
  assert.equal(gramCard('нет такой'), null)
  assert.equal(gramState({ st: 'soon' }), 'other')
})

test('список влогов плейлиста: номера верные и не повторяются, каждый готовый влог в списке', () => {
  const seen = new Set()
  for (const p of VLOG_PLAN) {
    assert.ok(YT_ID.test(p.yt), p.yt)
    assert.ok(!seen.has(p.yt), 'повтор ' + p.yt)
    assert.ok(p.title.trim() && p.dur > 0, p.yt)
    seen.add(p.yt)
  }
  for (const v of VLOGS) assert.ok(seen.has(v.yt), `влог ${v.id} не в списке плейлиста`)
})
