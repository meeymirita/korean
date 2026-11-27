import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { LONG_ALL, LONG_SENTENCES, checkLong, growSteps, longClauses, longText, longTrap, longWords } = await load('/src/game/long-sentences.ts')
const { LONG3 } = await load('/src/game/long-sentences-3.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
after(close)

const CONNS = ['그리고', '그런데', '그래서', '하지만', '그러니까']

describe('«Собери предложение»: уровень «Мастер+» (три части, две связки)', () => {
  test('предложения без повторов, у каждого три части, две разные связки, перевод частей и заметка', () => {
    assert.equal(LONG3.length, 153)
    assert.equal(new Set(LONG3.map(x => x.ko)).size, LONG3.length)
    const old = new Set(LONG_SENTENCES.map(longText))
    for (const x of LONG3) {
      const cls = longClauses(x)
      assert.equal(cls.length, 3, x.ko)
      assert.equal(x.parts.length, 3, x.ko)
      const conns = cls.slice(1).map(c => c[0][0])
      assert.ok(conns.every(c => CONNS.includes(c)), x.ko)
      assert.notEqual(conns[0], conns[1], x.ko)
      assert.ok(x.parts.every(p => p.trim().length > 3) && x.note.length > 20, x.ko)
      assert.ok(!old.has(longText(x)), 'повтор «Мастера»: ' + x.ko)
    }
    assert.equal(LONG_ALL.length, LONG_SENTENCES.length + LONG3.length)
  })

  test('все слова есть в словаре, перевод для «я» без рода, без иероглифов', () => {
    for (const x of LONG3) {
      const bad = analyze(longText(x)).filter(sg => sg.type === 'unknown').map(sg => sg.text)
      assert.deepEqual(bad, [], longText(x))
      const ru = x.ru + ' ' + x.parts.join(' ')
      assert.ok(!/(?:^|[^а-яё])я (?:[а-яё]+ ){0,4}[а-яё]+(?:ил|ал|ел|ёл|ла)(?![а-яё(])/i.test(ru), ru)
      assert.ok(!/[぀-ヿ一-鿿]/.test(x.ko + ru + x.note))
    }
  })

  test('урок раунда проверки: нет форм, которые ещё не пройдены', () => {
    const AHEAD = /(아서|어서|해서|ㄹ게요|게요|에게|한테|으로|로 |으니까|으면|는데|(?<!하)지만|고 싶|수 있|(?<![하리])고[ .,])/
    for (const x of LONG3) assert.ok(!AHEAD.test(longText(x)), longText(x))
  })

  test('порядок учебника принимается, чужая часть и неверная частица нет; перевод частей делится на те же части', () => {
    for (const x of LONG3) {
      const words = longWords(x)
      assert.ok(checkLong(x, words), longText(x))
      assert.ok(!checkLong(x, words.slice(0, -1)), 'без последнего слова')
      const k = words.findIndex(w => longTrap(w))
      if (k >= 0) {
        const bad = words.slice()
        bad[k] = longTrap(bad[k])
        assert.ok(!checkLong(x, bad), 'неверная частица: ' + bad.join(' '))
      }
      const steps = growSteps(x)
      assert.equal(steps.length, 3, x.ko)
      assert.equal(steps.map(s => s.ko.replace(/_/g, ' ')).join(' '), longText(x).replace(/[,.]/g, ''))
    }
  })
})
