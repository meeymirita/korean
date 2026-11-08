import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()

const hk = await load('/src/lib/hangulKeys.ts')
const kb = await load('/src/data/korean/keyboard.ts')
const { normalize } = await load('/src/stores/progress.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const letters = text => hk.keysOfText(text).map(k => (k.key.code.startsWith('Key') ? k.key.code.slice(3).toLowerCase() : k.key.code) + (k.key.shift ? '^' : '')).join(' ')

describe('тренажёр печати: раскладка 두벌식', () => {
  test('простые слоги и слова', () => {
    assert.equal(letters('가'), 'r k')
    assert.equal(letters('한'), 'g k s')
    assert.equal(letters('한국어'), 'g k s r n r d j')
  })
  test('составные гласные и 받침 набираются двумя клавишами', () => {
    assert.equal(letters('와'), 'd h k') // ㅇ ㅗ ㅏ
    assert.equal(letters('의'), 'd m l') // ㅇ ㅡ ㅣ
    assert.equal(letters('값'), 'r k q t') // ㄱ ㅏ ㅂ ㅅ
    assert.equal(letters('읽'), 'd l f r') // ㅇ ㅣ ㄹ ㄱ
  })
  test('двойные буквы идут с Shift', () => {
    assert.equal(letters('까'), 'r^ k')
    assert.equal(letters('뼈'), 'q^ u')
    assert.equal(letters('얘'), 'd o^')
  })
  test('пробел и знаки', () => {
    assert.equal(letters('가 가.'), 'r k Space r k Period')
    assert.equal(letters('뭐?'), 'a n j Slash^')
  })
  test('отдельные буквы-чамо печатаются своей клавишей', () => {
    assert.equal(letters('ㅂ'), 'q')
    assert.equal(letters('ㅏ'), 'k')
  })
  test('нажатие сверяется с ожидаемой клавишей, Shift только где важен', () => {
    const q = { code: 'KeyQ', shift: false }
    assert.ok(hk.matches(q, { code: 'KeyQ', shiftKey: false }))
    assert.ok(!hk.matches(q, { code: 'KeyQ', shiftKey: true }))
    assert.ok(!hk.matches(q, { code: 'KeyW', shiftKey: false }))
    assert.ok(hk.matches({ code: 'KeyK', shift: false }, { code: 'KeyK', shiftKey: true }))
    assert.ok(hk.matches({ code: 'KeyR', shift: true }, { code: 'KeyR', shiftKey: true }))
  })
  test('нельзя набрать текст с чужими знаками', () => {
    assert.ok(hk.isTypable('저는 학생이에요.'))
    assert.ok(!hk.isTypable('abc'))
  })
})

describe('тренажёр печати: уровни', () => {
  test('каждый уровень выдаёт нужное число заданий, которые можно набрать', () => {
    for (const l of kb.KB_LEVELS) {
      const items = kb.kbItems(l.id)
      assert.equal(items.length, l.count, l.id)
      for (const t of items) assert.ok(hk.isTypable(t), `${l.id}: ${t}`)
    }
  })
  test('диктовка: у каждого слова есть перевод для показа, слова разные', () => {
    assert.ok(kb.KB_LEVELS.some(l => l.id === 'dictation' && l.label === 'Диктовка'))
    for (let i = 0; i < 20; i++) {
      const items = kb.kbItems('dictation')
      assert.equal(new Set(items).size, items.length, 'без повторов')
      for (const t of items) assert.ok(kb.customLabel(t)?.ru, 'нет перевода у ' + t)
    }
  })
  test('слоги собираются правильно', () => {
    const syl = kb.kbItems('syllables')
    for (const s of syl) assert.match(s, /^[가-힣]$/)
  })
  test('число нажатий считается по буквам', () => {
    assert.equal(kb.keyCount(['한', '값']), 7)
  })
})

describe('тренажёр печати: свои слова и предложения', () => {
  const p = normalize({ v: 1 })
  const weak = D.slice(0, 6).map(d => d.k)
  for (const k of weak) p.words[k] = { ok: 0, bad: 3, streak: 0, last: 1 }

  test('на выбор только то, что набирается этими клавишами, без повторов', () => {
    for (const kind of ['words', 'sentences']) {
      const pool = kb.customPool(kind, 'dict', p)
      assert.ok(pool.length > 100, kind)
      assert.equal(new Set(pool.map(i => i.text)).size, pool.length)
      for (const it of pool) assert.ok(hk.isTypable(it.text), `${kind}: ${it.text}`)
    }
  })
  test('слова и предложения берутся из одного словаря: у слова его пример', () => {
    const w = kb.customPool('words', 'dict', p).find(i => i.text === D[0].k)
    const s = kb.customPool('sentences', 'dict', p).find(i => i.text === D[0].s)
    assert.ok(w && s)
  })
  test('«Мои ошибки» и «Повторить» дают только слова из этих списков', () => {
    const mist = kb.customPool('words', 'mistakes', p).map(i => i.text)
    assert.ok(mist.length > 0 && mist.every(t => weak.includes(t)))
    const due = kb.customPool('words', 'due', p).map(i => i.text)
    assert.ok(due.length > 0 && due.every(t => weak.includes(t)))
    assert.deepEqual(kb.customPool('words', 'mistakes', normalize({ v: 1 })), [])
  })
  test('поиск находит по корейскому, переводу и русской форме', () => {
    const pool = kb.customPool('words', 'dict', p)
    assert.ok(kb.searchCustom(pool, D[0].k).some(i => i.text === D[0].k))
    assert.ok(kb.searchCustom(pool, 'ем').length > 0)
    assert.equal(kb.searchCustom(pool, '').length, 30)
    assert.deepEqual(kb.searchCustom(pool, 'zzzzzzzz'), [])
  })
  test('случайное не повторяет выбранное и заканчивается, когда выбрано всё', () => {
    const pool = kb.customPool('words', 'mistakes', p)
    const taken = []
    for (let i = 0; i < pool.length; i++) {
      const it = kb.randomCustom(pool, taken)
      assert.ok(it && !taken.includes(it.text))
      taken.push(it.text)
    }
    assert.equal(kb.randomCustom(pool, taken), null)
  })
  test('подпись выбранного находится по тексту слова или предложения', () => {
    assert.equal(kb.customLabel(D[0].k)?.word.k, D[0].k)
    assert.equal(kb.customLabel(D[0].s)?.text, D[0].s)
    assert.equal(kb.customLabel('нет такого'), null)
  })
})
