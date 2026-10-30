import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { D, similarWords } = await load('/src/data/korean/words.ts')
after(close)

describe('похожие слова', () => {
  test('само слово не попадает в список, длина не больше лимита, без повторов', () => {
    for (const w of D.slice(0, 40)) {
      const s = similarWords(w, 6)
      assert.ok(s.length <= 6)
      assert.ok(!s.some(x => x.n === w.n))
      assert.equal(new Set(s.map(x => x.n)).size, s.length)
    }
  })

  test('учитывает общий слог: рядом со словом «학생» есть слова с «학»/«생», если они есть в словаре', () => {
    const w = D.find(d => d.k === '학생')
    assert.ok(w)
    const withSyl = D.filter(d => d.n !== w.n && ([...d.k].includes('학') || [...d.k].includes('생')))
    const s = similarWords(w, 6)
    if (withSyl.length) assert.ok(s.some(x => withSyl.includes(x)))
  })

  test('порядок устойчив: одинаковый запрос даёт одинаковый ответ', () => {
    const w = D[0]
    assert.deepEqual(similarWords(w).map(x => x.n), similarWords(w).map(x => x.n))
  })

  test('слову без совпадений достаётся пустой список, а не случайные слова', () => {
    const lonely = { ...D[0], n: -1, k: 'ㅋㅋ', ft: 'zzz', c: [] }
    assert.deepEqual(similarWords(lonely), [])
  })
})
