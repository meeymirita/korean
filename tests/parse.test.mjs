import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { analyze } = await load('/src/data/korean/parse.ts')
const { D } = await load('/src/data/korean/words.ts')
const tr = await load('/src/data/korean/translations.ts')
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

describe('analyze: частица 에 ведёт на нужную карточку', () => {
  const gOf = (sentence, text = '에') => analyze(sentence).find(x => x.text === text && x.type === 'particle')?.g
  test('время: после слов «когда» это карточка «에 (когда)», а не «место»', () => {
    assert.equal(gOf('금요일에 학교에 가요', '에'), 'when_e')
    assert.equal(gOf('주말에 집에 있어요'), 'when_e')
    assert.equal(gOf('아침에 공부해요'), 'when_e')
  })
  test('направление: с глаголом движения это «에 가다», с 있다 — место нахождения', () => {
    const goes = analyze('학교에 가요').find(x => x.text === '에')
    assert.equal(goes.g, 'gada')
    assert.match(goes.gloss, /куда/)
    assert.equal(analyze('집에 있어요').find(x => x.text === '에').g, 'iss')
  })
  test('в одном предложении у времени и места разные карточки', () => {
    const marks = analyze('주말에 학교에 가요').filter(x => x.text === '에').map(x => x.g)
    assert.deepEqual(marks, ['when_e', 'gada'])
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

  test('покрытие не падает ниже достигнутого (было 518 из 544)', () => {
    const full = sentences.filter(s => analyze(s).every(x => x.type !== 'unknown')).length
    assert.ok(full >= 515, `целиком разбирается ${full} из ${sentences.length}`)
  })
})

describe('analyze: вежливое 요 и формы из примеров', () => {
  test('«저도요»: слово, частица и вежливое окончание', () => {
    assert.deepEqual(parts('저도요.'), [['저', 'word'], ['도', 'particle'], ['요', 'ending']])
    assert.deepEqual(parts('저는요'), [['저', 'word'], ['는', 'particle'], ['요', 'ending']])
  })

  test('«요» не отрывается от обычных слов', () => {
    assert.deepEqual(parts('가요'), [['가요', 'verb']])
  })

  test('в примерах сайта нет слов «нет в словаре»', () => {
    const { TRANSLATIONS } = tr
    const bad = Object.keys(TRANSLATIONS).filter(s => analyze(s).some(x => x.type === 'unknown'))
    assert.deepEqual(bad, [])
  })
})

describe('analyze: 만 и -(으)ㄹ 거예요 (карточки man и future_my)', () => {
  test('만 после слова и после 에 / 에서, с карточкой man', () => {
    for (const s of ['저는 이 가수만 좋아해요.', '교실에 선생님만 있어요.', '일요일에만 청소해요.', '집에서만 커피를 마셔요.']) {
      const segs = analyze(s)
      assert.ok(!segs.some(x => x.type === 'unknown'), s)
      assert.ok(segs.some(x => x.text === '만' && x.type === 'particle' && x.g === 'man'), s)
    }
    // 에 / 에서 стоит до 만
    assert.deepEqual(parts('집에서만 마셔요').slice(0, 3), [['집', 'word'], ['에서', 'particle'], ['만', 'particle']])
  })

  test('форма перед 거예요: ㄹ после гласной, 을 после 받침, основа на ㄹ, глаголы на 하다', () => {
    for (const [s, form] of [['바다에 갈 거예요.', '갈'], ['사진을 찍을 거예요.', '찍을'], ['서울에서 살 거예요.', '살'], ['김치찌개를 만들 거예요.', '만들'], ['토요일에 운동할 거예요.', '운동할'], ['내일 친구를 만날 거예요.', '만날']]) {
      const segs = analyze(s)
      assert.ok(!segs.some(x => x.type === 'unknown'), s)
      const v = segs.find(x => x.text === form)
      assert.equal(v?.type, 'verb', `${s}: ${form}`)
      assert.equal(v?.g, 'future_my')
      assert.ok(segs.some(x => x.text === '거예요' && x.type === 'ending' && x.g === 'future_my'), s)
    }
  })

  test('обычные слова на ㄹ не принимаются за форму будущего', () => {
    assert.deepEqual(parts('물'), [['물', 'word']])
  })
})

describe('analyze: прошедшее от связки (past_i)', () => {
  test('이었어요 после 받침, 였어요 без 받침, карточка past_i, форма — окончание', () => {
    for (const [s, form, head] of [['어제는 일요일이었어요.', '이었어요', '일요일'], ['그 사람은 제 친구였어요.', '였어요', '친구'], ['동생은 대학생이었어요.', '이었어요', '대학생']]) {
      const segs = analyze(s)
      assert.ok(!segs.some(x => x.type === 'unknown'), s)
      assert.ok(segs.some(x => x.text === head && x.type === 'word'), s)
      assert.ok(segs.some(x => x.text === form && x.type === 'ending' && x.g === 'past_i'), s)
    }
    // 받침 не совпадает: 일요일였어요 — неверная форма не разбирается как связка
    assert.ok(!analyze('일요일였어요').some(x => x.g === 'past_i'))
    assert.equal(analyze('저는 학생이 아니었어요.').some(x => x.type === 'unknown'), false)
  })
})

