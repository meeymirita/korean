import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const hk = await load('/src/lib/hangulKeys.ts')
const kb = await load('/src/data/korean/keyboard.ts')
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
  test('слоги собираются правильно', () => {
    const syl = kb.kbItems('syllables')
    for (const s of syl) assert.match(s, /^[가-힣]$/)
  })
  test('число нажатий считается по буквам', () => {
    assert.equal(kb.keyCount(['한', '값']), 7)
  })
})
