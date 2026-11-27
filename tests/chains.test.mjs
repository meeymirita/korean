import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { load, close } from './_load.mjs'

after(close)

const { CHAINS, LINKS, linksOf, marked, linkOf } = await load('/src/data/korean/chains.ts')

// не пройдено (docs/data.md, «Проверка нейросетями»): -아서/어서, -고, -지만, (으)ㄹ게요, 에게/한테, (으)로 (그러니까 и 하지만 разрешены, решение владельца 2026-11-27)
const AHEAD = /(아서|어서|해서|ㄹ게요|게요|에게|한테|으로|로 |(?<!하)지만|(?<!하)고[ .])/

test('в каждой цепочке 3–4 предложения и две-три разные связки', () => {
  assert.ok(CHAINS.length >= 5)
  for (const c of CHAINS) {
    assert.ok(c.steps.length >= 3 && c.steps.length <= 4, c.id)
    const links = linksOf(c)
    assert.ok(new Set(links).size >= 2, `${c.id}: нужно две и больше разных связок`)
    assert.ok(links.every(l => l in LINKS), c.id)
    assert.equal(linkOf(c.steps[0][0]), undefined, `${c.id}: цепочка начинается без связки`)
  }
})

test('каждое предложение переведено, «я» без рода, без непройденного и без «и … тоже»', () => {
  for (const c of CHAINS) {
    for (const [ko, ru] of c.steps) {
      assert.ok(ko.trim() && ru.trim(), `${c.id}: пустое предложение`)
      assert.ok(ko.endsWith('.'), `${c.id}: ${ko}`)
      assert.doesNotMatch(ko.replaceAll('그리고', ''), AHEAD, `${c.id}: ${ko} (непройденное)`)
      assert.ok(!(ko.startsWith('그리고') && /도 /.test(ko)), `${c.id}: «и … тоже» вместе: ${ko}`)
      // «я» без рода: прошедшее время только как «пошёл(ла)», «учил(а)»
      if (/(^|\s)я(\s|$)/i.test(ru)) assert.doesNotMatch(ru, /(^|\s)\S*(л|ла|лся|лась)(?=[\s.,]|$)/u, `${c.id}: род в «я»: ${ru}`)
    }
  }
})

test('связка подсвечивается', () => {
  assert.equal(marked('그래서 저는 집에 있어요.'), '{k|그래서} 저는 집에 있어요.')
  assert.equal(marked('오늘 비가 와요.'), '오늘 비가 와요.')
})
