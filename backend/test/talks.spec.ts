import { describe, expect, it } from 'vitest'
import { snippetOf, TalksService } from '../src/talks/talks.service'

// Общая история разговоров: чистые функции (без базы).
describe('поиск по разговорам: запрос', () => {
  it('запрос короче двух знаков поиском не считается, длинный обрезается до 80, не строка игнорируется', () => {
    expect(TalksService.cleanQuery('х')).toBe('')
    expect(TalksService.cleanQuery('  хлеб ')).toBe('хлеб')
    expect(TalksService.cleanQuery('а'.repeat(200))).toHaveLength(80)
    expect(TalksService.cleanQuery(undefined)).toBe('')
    expect(TalksService.cleanQuery({ a: 1 })).toBe('')
  })
})

describe('поиск по разговорам: кусок текста', () => {
  it('берёт текст вокруг совпадения, регистр не важен, на краях ставит многоточие', () => {
    const long = `${'а'.repeat(80)} ХЛЕБ ${'б'.repeat(80)}`
    const s = snippetOf(long, 'хлеб')
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s).toContain('ХЛЕБ')
    expect(s.length).toBeLessThan(120)
  })
  it('короткий текст целиком, нет совпадения: начало текста, переносы строк схлопываются', () => {
    expect(snippetOf('Как сказать\nхлеб', 'хлеб')).toBe('Как сказать хлеб')
    expect(snippetOf('совсем другое', 'хлеб')).toBe('совсем другое')
  })
})
