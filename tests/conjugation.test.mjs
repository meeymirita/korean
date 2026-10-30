import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { CONJUGATIONS, negate } = await load('/src/data/korean/conjugation.ts')
after(close)

describe('слово в разных формах', () => {
  test('отрицание с «안»: обычные слова, существительное + 하다, 좋아하다', () => {
    assert.equal(negate('가다', '가요'), '안 가요')
    assert.equal(negate('공부하다', '공부해요'), '공부 안 해요')
    assert.equal(negate('좋아하다', '좋아해요'), '안 좋아해요')
    assert.equal(negate('싫어하다', '싫어해요'), '안 싫어해요')
    assert.equal(negate('하다', '해요'), '안 해요', 'сам глагол 하다')
  })

  test('есть и глаголы, и прилагательные; у каждого три формы, все хангылем', () => {
    assert.ok(CONJUGATIONS.filter(c => c.kind === 'verb').length > 40)
    assert.ok(CONJUGATIONS.filter(c => c.kind === 'adj').length > 20)
    for (const c of CONJUGATIONS) {
      for (const f of [c.present, c.past, c.neg]) assert.match(f, /^[가-힣 ]+$/, `${c.k}: ${f}`)
      assert.ok(c.present.endsWith('요') && c.past.endsWith('요'))
      assert.ok(c.neg.includes('안'))
    }
  })

  test('известные формы совпадают с учебником', () => {
    const by = Object.fromEntries(CONJUGATIONS.map(c => [c.k, c]))
    assert.deepEqual([by['가다'].present, by['가다'].past, by['가다'].neg], ['가요', '갔어요', '안 가요'])
    assert.deepEqual([by['춥다'].present, by['춥다'].past], ['추워요', '추웠어요'])
  })
})
