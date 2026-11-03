import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const lab = await load('/src/data/korean/lab.ts')
after(close)

const P = id => lab.PARTICLES.find(p => p.id === id)

describe('мастерская: конструктор', () => {
  test('частица выбирается по 받침', () => {
    assert.equal(lab.attach('친구', P('topic')).text, '친구는')
    assert.equal(lab.attach('학생', P('topic')).text, '학생은')
    assert.equal(lab.attach('책', P('obj')).text, '책을')
    assert.equal(lab.attach('커피', P('obj')).text, '커피를')
    assert.equal(lab.attach('물', P('subj')).text, '물이')
    assert.equal(lab.attach('카페', P('subj')).text, '카페가')
  })
  test('у 에 и 에서 одна форма, у 저 с 이/가 особая', () => {
    assert.equal(lab.attach('집', P('to')).text, '집에')
    assert.equal(lab.attach('학교', P('at')).text, '학교에서')
    assert.equal(lab.attach('저', P('subj')).text, '제가')
    assert.equal(lab.attach('저', P('topic')).text, '저는')
  })
  test('предложение собирается из слов, частиц и формы глагола', () => {
    const v = lab.VERBS.find(x => x.k === '마시다')
    assert.ok(v)
    const b = lab.build({ noun: '저', p: P('topic') }, { noun: '커피', p: P('obj') }, v, 'present')
    assert.equal(b.sentence, `저는 커피를 ${v.present}.`)
    assert.equal(b.steps.length, 3)
    assert.match(lab.build({ noun: '저', p: P('topic') }, { noun: '커피', p: P('obj') }, v, 'neg').sentence, /안 /)
  })
  test('есть десять глаголов со всеми тремя формами', () => {
    assert.ok(lab.VERBS.length >= 8)
    for (const v of lab.VERBS) assert.ok(v.present && v.past && v.neg, v.k)
  })
})
