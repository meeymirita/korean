import { describe, expect, it } from 'vitest'
import { mergeSearchResults, resultFromSearchReply, search, searchDocuments } from '@/data/korean/search'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { CONJUGATIONS } from '@/data/korean/conjugation'
import { SE } from '@/data/korean/words'
import { ALL_GAMES } from '@/data/games'

describe('публичный индекс поиска', () => {
  it('собирает ограниченный каталог учебных материалов без личных разделов', () => {
    const documents = searchDocuments()
    expect(documents.length).toBeGreaterThan(0)
    expect(documents.length).toBeLessThanOrEqual(25_000)
    expect(JSON.stringify(documents).length).toBeLessThan(4 * 1024 * 1024)
    expect(documents.every(document => document.id.length <= 100 && document.text.length <= 12_000)).toBe(true)
    expect(documents.every(document => !/^(note|image|session|event):/i.test(document.id))).toBe(true)
    expect(new Set(documents.map(document => document.id)).size).toBe(documents.length)
    expect(documents.some(document => document.category === 'word')).toBe(true)
    expect(documents.some(document => document.category === 'grammar')).toBe(true)
    expect(documents.some(document => document.category === 'reference')).toBe(true)
    expect(documents.some(document => document.category === 'game' && document.id === `game:${ALL_GAMES[0]!.id}`)).toBe(true)
    const sentence = documents.find(document => document.id === 'sentence:0')!
    expect(sentence.text).toContain(SE[0]!.k)
    expect(sentence.text).toContain(SE[0]!.t)
    expect(documents.every(document => !document.target || (document.target.startsWith('/') && !document.target.startsWith('//')))).toBe(true)
  })

  it('восстанавливает типизированную выдачу для текущих компонентов интерфейса', () => {
    const documents = searchDocuments()
    const selected = documents.filter(document => [`word:${D[0]!.n}`, `grammar:${G[0]!.id}`, 'sentence:0', 'letter:0', 'reference:talk:0', 'form:0'].includes(document.id))
    const result = resultFromSearchReply({ query: '학교', hits: selected, total: 6, limit: 30, offset: 0 })

    expect(result.total).toBe(6)
    expect(result.words).toHaveLength(1)
    expect(result.grammar[0]?.g.id).toBe(G[0]!.id)
    expect(result.sentences).toHaveLength(1)
    expect(result.letters).toHaveLength(1)
    expect(result.chunks.talk).toHaveLength(1)
    expect(result.forms[0]?.k).toBe(CONJUGATIONS[0]!.k)
  })

  it('индекс только дополняет локальный поиск: порядок и полнота локальных результатов сохраняются, дублей нет', () => {
    const local = search('дом')!
    expect(local.words.length).toBeGreaterThan(0)
    const documents = searchDocuments()
    // «выдача индекса»: одно слово, которое уже есть локально, и одно, которого нет
    const have = local.words[0]!
    const missing = D.find(word => !local.words.some(item => item.n === word.n))!
    const hits = documents.filter(document => [`word:${have.n}`, `word:${missing.n}`].includes(document.id))
    const merged = mergeSearchResults(local, resultFromSearchReply({ query: 'дом', hits, total: 2, limit: 100, offset: 0 }))
    expect(merged.words.slice(0, local.words.length).map(word => word.n)).toEqual(local.words.map(word => word.n))
    expect(merged.words).toHaveLength(local.words.length + 1)
    expect(merged.words.at(-1)!.n).toBe(missing.n)
    expect(new Set(merged.words.map(word => word.n)).size).toBe(merged.words.length)
    expect(merged.total).toBe(local.total + 1)
    // пустой локальный результат: берётся выдача индекса целиком
    expect(mergeSearchResults(null, resultFromSearchReply({ query: 'x', hits, total: 2, limit: 100, offset: 0 })).words).toHaveLength(2)
  })
})
