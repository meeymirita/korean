import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { RAW, CAT, CATN } = await load('/src/data/korean/dictionary.ts')
const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
const { G, tabOf } = await load('/src/data/korean/grammar.ts')
const { D: GAME } = await load('/src/game/words.ts')
const { EXCHANGES } = await load('/src/game/dialogs.ts')
after(close)

const DAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']
const NEW = RAW.filter(w => w.n > 530 && w.n <= 555)

describe('тема «Время и дни»: слова', () => {
  test('25 новых слов с чтением, переводом и примером, дней недели семь', () => {
    assert.equal(NEW.length, 25)
    for (const w of NEW) assert.ok(w.k && w.r && w.t && w.s, `пустое поле у ${w.k}`)
    for (const d of DAYS) assert.ok(NEW.some(w => w.k === d), `нет дня ${d}`)
    for (const k of ['요일', '평일', '주말', '점심', '밤', '주', '이번 주', '다음 주', '지난주', '내일', '언제']) assert.ok(NEW.some(w => w.k === k), k)
  })

  test('слова и примеры не повторяются, у каждого примера есть перевод', () => {
    assert.equal(new Set(RAW.map(w => w.k)).size, RAW.length, 'повтор слова')
    const old = new Set(RAW.filter(w => w.n <= 530).map(w => w.s))
    const fresh = NEW.map(w => w.s)
    assert.equal(new Set(fresh).size, fresh.length, 'новые предложения повторяются')
    for (const s of fresh) assert.ok(!old.has(s), `предложение уже есть у другого слова: ${s}`)
    for (const w of NEW) assert.ok(TRANSLATIONS[w.s], `нет перевода: ${w.s}`)
  })

  test('новая тема «время» есть в списке тем и содержит дни недели и прежние слова про время', () => {
    assert.equal(CATN['время'], 'Время и дни')
    for (const d of DAYS) assert.ok(CAT['время'].includes(d), d)
    for (const k of ['오늘', '어제', '아침', '저녁', '지금', '시간', '매일']) assert.ok(CAT['время'].includes(k), k)
    for (const k of CAT['время']) assert.ok(RAW.some(w => w.k === k), `в теме «время» лишнее слово ${k}`)
  })

  test('все новые примеры разбираются целиком, без «?»', () => {
    for (const w of NEW) {
      const unknown = analyze(w.s).filter(x => x.type === 'unknown').map(x => x.text)
      assert.deepEqual(unknown, [], w.s)
    }
  })

  test('в игре есть группа слов «Время и дни», все её слова есть в словаре', () => {
    assert.ok(GAME.W.length >= 18)
    for (const [ko] of GAME.W) assert.ok(RAW.some(w => w.k === ko), `в игре слово ${ko}, а в словаре его нет`)
    for (const d of DAYS) assert.ok(GAME.W.some(r => r[0] === d), d)
  })

  test('диалог «내일 시간이 있어요?» есть в игре; тег это «семья вопроса» (ответы одного тега друг другу подходят), вопросы не повторяются', () => {
    assert.ok(EXCHANGES.some(x => x[0] === '내일 시간이 있어요?' && x[2] === '미안해요. 시간이 없어요.'))
    const free = EXCHANGES.filter(x => x[4] === 'free')
    assert.equal(free.length, 1, 'у «free» своя тема')
    const qs = EXCHANGES.map(x => x[0])
    assert.equal(new Set(qs).size, qs.length, 'вопросы не повторяются')
    assert.ok(new Set(EXCHANGES.map(x => x[4])).size >= 30, 'тем достаточно')
  })
})

describe('карточки от Леры и вкладки грамматики', () => {
  const ids = ['when_e', 'too_do']
  const marks = g => g.b.filter(b => b[0] === 'ex').flatMap(b => b[1]).filter(([ko]) => /\{k\|/.test(ko))

  test('две карточки от Леры есть, свои (без номера урока), владелец отметил их пройденными (st ok)', () => {
    for (const id of ids) {
      const g = G.find(x => x.id === id)
      assert.ok(g, id)
      assert.ok(!g.l, `${id}: у своей карточки нет подписи урока`)
      assert.equal(g.st, 'ok', `${id}: владелец отметил её пройденной`)
      assert.ok(marks(g).length >= 4, `${id}: мало примеров с выделенной частицей`)
    }
  })

  test('карточка про 에 перечисляет четыре слова без 에', () => {
    const g = G.find(x => x.id === 'when_e')
    const text = JSON.stringify(g.b)
    for (const w of ['오늘', '내일', '지금', '언제']) assert.ok(text.includes(w), w)
  })

  test('каждая карточка попадает ровно в одну вкладку: 0 — свои, 1 и 2 — части видеокурса', () => {
    for (const g of G) assert.ok([0, 1, 2].includes(tabOf(g)), g.id)
    const own = G.filter(g => tabOf(g) === 0)
    assert.ok(own.every(g => !g.l))
    assert.ok(G.filter(g => !g.l).every(g => tabOf(g) === 0))
    assert.ok(G.filter(g => g.part === 2).every(g => tabOf(g) === 2))
    assert.ok(G.filter(g => g.l && (g.part ?? 1) === 1).every(g => tabOf(g) === 1))
    for (const id of ids) assert.equal(tabOf(G.find(x => x.id === id)), 0)
  })
})
