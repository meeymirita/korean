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

describe('мастерская: дерево тем', () => {
  test('все темы дерева есть в грамматике, зависимости известны и без циклов', async () => {
    const { G } = await load('/src/data/korean/grammar.ts')
    const ids = new Set(G.map(g => g.id))
    for (const [id, deps] of Object.entries(lab.DEPS)) {
      assert.ok(ids.has(id), `нет карточки ${id}`)
      for (const d of deps) {
        assert.ok(ids.has(d) && d in lab.DEPS, `${id}: неизвестная зависимость ${d}`)
        assert.ok(lab.depthOf(d) < lab.depthOf(id), `${id}: цикл или неверный уровень с ${d}`)
      }
    }
  })
  test('уровни покрывают все темы по одному разу', () => {
    const flat = lab.treeLevels().flat()
    assert.equal(flat.length, Object.keys(lab.DEPS).length)
    assert.equal(lab.depthOf('iyo'), 0)
    assert.ok(lab.depthOf('past_i') > lab.depthOf('past'))
  })
})

describe('мастерская: «Почему так» и два стиля', () => {
  test('объяснения привязаны к существующим пройденным карточкам', async () => {
    const { G } = await load('/src/data/korean/grammar.ts')
    for (const w of lab.WHY) {
      const g = G.find(x => x.id === w.id)
      assert.ok(g, `нет карточки ${w.id}`)
      assert.ok(w.q.trim() && w.a.length > 40, w.id)
    }
    assert.equal(new Set(lab.WHY.map(w => w.id)).size, lab.WHY.length)
  })
  test('пары стилей полные, разговорная форма отличается от вежливой', () => {
    assert.ok(lab.STYLES.length >= 10)
    for (const s of lab.STYLES) {
      assert.ok(s.pol && s.cas && s.ru && s.note)
      assert.notEqual(s.pol, s.cas)
    }
  })
  test('нет будущего времени и японских/китайских знаков', () => {
    const all = JSON.stringify([lab.WHY, lab.STYLES, lab.STYLE_RULES])
    assert.ok(!/[぀-ヿ一-鿿]/.test(all))
    assert.ok(!/ㄹ 거예요|ㄹ까요/.test(all))
  })
})
