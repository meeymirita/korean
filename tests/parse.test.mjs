import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { analyze } = await load('/src/data/korean/parse.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

/** [текст, тип] каждого куска разбора */
const parts = s => analyze(s).map(x => [x.text, x.type])

describe('analyze: частицы по 받침', () => {
  test('после гласной — 는, 가, 를', () => {
    assert.deepEqual(parts('친구는 책을 읽어요'), [['친구', 'word'], ['는', 'particle'], ['책', 'word'], ['을', 'particle'], ['읽어요', 'verb']])
    assert.ok(parts('친구가 가요').some(([t]) => t === '가'))
    assert.ok(parts('커피를 마셔요').some(([t]) => t === '를'))
  })

  test('после согласной — 은, 이', () => {
    assert.ok(parts('학생은 학교에 가요').some(([t]) => t === '은'))
    assert.ok(parts('책이 있어요').some(([t]) => t === '이'))
  })

  test('есть-связка: 이에요 после согласной, 예요 после гласной', () => {
    assert.deepEqual(parts('저는 학생이에요').at(-1), ['이에요', 'ending'])
    assert.deepEqual(parts('선생님은 의사예요').at(-1), ['예요', 'ending'])
  })

  test('место и действие: 에, 에서', () => {
    assert.ok(parts('학교에 가요').some(([t, ty]) => t === '에' && ty === 'particle'))
    assert.ok(parts('집에서 쉬어요').some(([t, ty]) => t === '에서' && ty === 'particle'))
  })
})

describe('analyze: слова и формы', () => {
  test('глаголы настоящего и прошедшего времени, -해요', () => {
    assert.equal(parts('버스를 타요').at(-1)[1], 'verb')
    assert.deepEqual(parts('저는 어제 도서관에서 공부했어요').at(-1), ['공부했어요', 'verb'])
    assert.deepEqual(parts('한국어를 공부해요').at(-1), ['공부해요', 'verb'])
  })

  test('число и счётное слово: «два яблока»', () => {
    const p = parts('사과 두 개를 먹어요')
    assert.deepEqual(p.map(([t]) => t), ['사과', '두', '개', '를', '먹어요'])
  })

  test('неизвестное слово — карточка «?», разбор не падает', () => {
    assert.deepEqual(parts('xyz'), [['xyz', 'unknown']])
    assert.doesNotThrow(() => analyze(''))
    assert.doesNotThrow(() => analyze('   ?!  '))
  })

  test('у куска есть перевод, у частицы — пояснение', () => {
    const [w, p] = analyze('책을 읽어요')
    assert.ok(w.gloss, 'у слова есть перевод')
    assert.equal(p.type, 'particle')
    assert.ok(p.explain, 'у частицы есть пояснение')
  })

  test('куски склеиваются обратно в то же предложение', () => {
    for (const s of ['저는 학생이에요', '카페에서 커피를 마셔요', '학생은 학교에 가요']) {
      assert.equal(analyze(s).map(x => x.text).join(''), s.replace(/ /g, ''))
    }
  })
})

describe('analyze: примеры из словаря', () => {
  const sentences = [...new Set(D.map(d => d.s).filter(Boolean))]

  test('ни одно предложение словаря не роняет разбор', () => {
    for (const s of sentences) assert.doesNotThrow(() => analyze(s), s)
  })

  test('покрытие не падает ниже достигнутого (было 490 из 517)', () => {
    const full = sentences.filter(s => analyze(s).every(x => x.type !== 'unknown')).length
    assert.ok(full >= 485, `целиком разбирается ${full} из ${sentences.length}`)
  })
})
