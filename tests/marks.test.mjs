import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const m = await load('/src/lib/marks.ts')
const { normalize, useProgressStore } = await load('/src/stores/progress.ts')
const { markedWords, marksTasks } = await load('/src/data/korean/marks-drill.ts')
const { STUDY } = await load('/src/data/korean/study.ts')
const { createPinia, setActivePinia } = await import('pinia')
after(close)

describe('метки: разбор и лимиты', () => {
  test('parseMark знает пять видов и отбрасывает остальное', () => {
    assert.deepEqual(m.parseMark('k:사과'), { kind: 'k', id: '사과' })
    assert.deepEqual(m.parseMark('w:사람'), { kind: 'w', id: '사람' })
    for (const bad of ['x:слово', 'k:', 'k', 'kk:слово', 5, null, 'k:' + 'а'.repeat(41)]) assert.equal(m.parseMark(bad), null, String(bad))
    assert.ok(m.parseMark('k:' + 'а'.repeat(40)))
  })

  test('isMarkableWord: пустое, с пробелом по краям и длинное слово не отмечаем', () => {
    assert.equal(m.isMarkableWord('사과'), true)
    assert.equal(m.isMarkableWord('먹고 싶다'), true)
    for (const bad of ['', ' 사과', '사과 ', 'а'.repeat(41), undefined, 7]) assert.equal(m.isMarkableWord(bad), false, String(bad))
  })

  test('лимиты: 500 прежних, 500 из словаря, всего 1000', () => {
    assert.equal(m.MAX_MARKS, 500)
    assert.equal(m.MAX_K_MARKS, 500)
    assert.equal(m.MAX_MARKS_TOTAL, 1000)
    const w = Array.from({ length: 500 }, (_, i) => 'w:' + i)
    assert.equal(m.canAddMark(w, 'w'), false)
    assert.equal(m.canAddMark(w, 'k'), true, 'полные «Важные» не мешают избранному словаря')
    const k = Array.from({ length: 500 }, (_, i) => 'k:' + i)
    assert.equal(m.canAddMark(k, 'k'), false)
    assert.equal(m.canAddMark(k, 'g'), true, 'избранное словаря не вытесняет правила')
  })

  test('cleanMarks: повторы, мусор и лишнее по лимитам', () => {
    assert.deepEqual(m.cleanMarks(['k:사과', 'k:사과', 'w:친구', 5, 'x:y', 'g:a']), ['k:사과', 'w:친구', 'g:a'])
    assert.deepEqual(m.cleanMarks('k:사과'), [])
    const many = [...Array.from({ length: 600 }, (_, i) => 'k:' + i), ...Array.from({ length: 600 }, (_, i) => 'w:' + i)]
    const out = m.cleanMarks(many)
    assert.equal(out.length, 1000)
    assert.equal(out.filter(x => x.startsWith('k:')).length, 500)
  })

  test('kWords берёт только k:', () => {
    assert.deepEqual(m.kWords(['w:a', 'k:사과', 'g:b', 'k:먹다']), ['사과', '먹다'])
  })

  test('normalize стора пропускает k: и режет по лимитам', () => {
    const d = normalize({ v: 1, settings: { marks: ['k:사과', 'w:친구', 'k:사과', 'z:1'] } })
    assert.deepEqual(d.settings.marks, ['k:사과', 'w:친구'])
  })

  test('сервер держит те же вид метки и лимиты', () => {
    const src = readFileSync(new URL('../backend/src/progress/progress.service.ts', import.meta.url), 'utf8')
    assert.ok(src.includes('const MARK = ' + m.MARK_RE.toString()), 'MARK')
    assert.ok(src.includes(`const MAX_MARKS = ${m.MAX_MARKS}\n`), 'MAX_MARKS')
    assert.ok(src.includes(`const MAX_K_MARKS = ${m.MAX_K_MARKS}\n`), 'MAX_K_MARKS')
  })
})

describe('стор: звёздочка k:', () => {
  test('toggleMark(k) ставит и снимает, лимит k отдельный', () => {
    setActivePinia(createPinia())
    const s = useProgressStore()
    assert.equal(s.isMarked('k', '사과'), false)
    assert.equal(s.toggleMark('k', '사과'), true)
    assert.deepEqual(s.data.settings.marks, ['k:사과'])
    assert.equal(s.isMarked('w', '사과'), false, 'w: и k: не путаются')
    for (let i = 0; i < 499; i++) assert.equal(s.toggleMark('k', 'слово' + i), true)
    assert.equal(s.toggleMark('k', 'лишнее'), false)
    assert.equal(s.toggleMark('w', 'важное'), true, 'прежний лимит w не затронут')
    assert.equal(s.toggleMark('k', '사과'), true, 'снять можно всегда')
  })
})

describe('серия по важным словам и k:', () => {
  test('k: не попадают ни в годные, ни в пропущенные, ни в задания', () => {
    const words = STUDY.filter(d => /^[가-힣]+$/.test(d.k)).slice(0, 6).map(d => d.k)
    const p = normalize({ v: 1 })
    p.settings.marks = [...words.slice(0, 5).map(k => 'w:' + k), ...words.slice(5).map(k => 'k:' + k), 'k:사과']
    const st = markedWords(p)
    assert.equal(st.usable.length, 5)
    assert.equal(st.skipped, 0)
    assert.ok(!marksTasks(p).some(t => t.word === words[5] || t.word === '사과'))
    // только k: слов хватает по числу, а серии нет
    p.settings.marks = words.map(k => 'k:' + k)
    assert.deepEqual(marksTasks(p), [])
  })
})
