import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { clipText, pickDictHit, CLIP_MAX } = await load('/src/data/korean/clip.ts')
const { KNOWN_STREAK } = await load('/src/stores/progress.ts')
const { STUDY, EXTRA } = await load('/src/data/korean/study.ts')
const { analyze, particleStem } = await load('/src/data/korean/parse.ts')
after(close)

const word = (r, core) => r.words.find(w => w.core === core)

describe('вырезка из текста: подсветка и счётчик', () => {
  test('форма приводится к словарной: 가요 → 가다, частица снимается: 학교에서 → 학교', () => {
    assert.ok(STUDY.some(w => w.k === '가다') && STUDY.some(w => w.k === '학교'))
    const r = clipText('학교에서 가요', k => (k === '가다' ? KNOWN_STREAK : 0))
    assert.equal(word(r, '가요').own.k, '가다')
    assert.equal(word(r, '가요').state, 'learned')
    assert.equal(word(r, '학교에서').own.k, '학교')
    assert.equal(word(r, '학교에서').state, 'new')
  })

  test('공부해요 → 공부하다 (слово на -하다), если оно у владельца', () => {
    const own = STUDY.some(w => w.k === '공부하다')
    const w = clipText('공부해요').words[0]
    assert.equal(w.key, own ? '공부하다' : '공부')
  })

  test('состояние по очкам: 0 новое, 1–4 учу, от KNOWN_STREAK выучено', () => {
    const at = n => clipText('학교', () => n).words[0].state
    assert.deepEqual([at(0), at(1), at(KNOWN_STREAK - 1), at(KNOWN_STREAK), at(KNOWN_STREAK + 4)], ['new', 'learning', 'learning', 'learned', 'learned'])
  })

  test('счётчик: разные слова считаются один раз, знаки и пробелы сохраняются в частях', () => {
    const text = '학교에 가요.\n"학교" 가요, 쓰레기통!'
    const r = clipText(text)
    assert.equal(r.parts.map(p => p.text).join(''), text)
    assert.equal(r.total, 3)
    assert.equal(r.known, 2)
    assert.equal(r.learned, 0)
    assert.deepEqual(r.words.filter(w => w.state === 'unknown').map(w => w.core), ['쓰레기통'])
  })

  test('слово «дополнительное» (EXTRA) и слово вне словаря не свои, у них запросы для большого словаря', () => {
    const extra = [...EXTRA][0]
    const r = clipText(`${extra} 쓰레기통`)
    for (const w of r.words) {
      assert.equal(w.own, undefined)
      assert.equal(w.state, 'unknown')
      assert.ok(w.queries.length >= 1)
    }
  })

  test('слово вне словаря с частицей: запросы идут и со словом, и без частицы (particleStem)', () => {
    assert.equal(particleStem('대학교에서'), '대학교')
    assert.equal(particleStem('가'), null)
    const r = clipText('쓰레기통은')
    const w = r.words.find(x => x.core === '쓰레기통은')
    assert.ok(analyze('쓰레기통은').every(s => s.type === 'unknown'))
    assert.deepEqual(w.queries, ['쓰레기통은', '쓰레기통'])
  })

  test('без корейского нет слов, длинный текст обрезается до 2000 знаков', () => {
    const e = clipText('Hello, 123! ...')
    assert.equal(e.total, 0)
    assert.equal(e.known, 0)
    const long = clipText('학교 '.repeat(1000))
    assert.equal(long.cut, true)
    assert.equal(long.parts.map(p => p.text).join('').length, CLIP_MAX)
    assert.equal(clipText('학교').cut, false)
  })

  test('пустой текст', () => {
    const r = clipText('')
    assert.deepEqual([r.parts.length, r.total, r.known], [0, 0, 0])
  })
})

describe('вырезка из текста: запись большого словаря', () => {
  const hit = word => ({ word, ru: 'x' })
  test('точное слово или словарная форма из via.forms', () => {
    assert.equal(pickDictHit('비빔밥', { hits: [hit('비빔'), hit('비빔밥')] }).word, '비빔밥')
    assert.equal(pickDictHit('먹었어요', { hits: [hit('먹다'), hit('먹이')], via: { forms: ['먹다'] } }).word, '먹다')
  })
  test('просто похожие слова поиска не считаются', () => {
    assert.equal(pickDictHit('비빔', { hits: [hit('비빔밥')] }), null)
    assert.equal(pickDictHit('쓰', { hits: [], via: { forms: ['쓰다'] } }), null)
  })
})
