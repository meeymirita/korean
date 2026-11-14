import { describe, expect, it } from 'vitest'
import { ruDescription, ruJsonLd, ruLead, ruTitle } from '@/lib/ruSeo'
import { seoFor } from '@/data/seo'

// Русско-корейские страницы «школа по-корейски»: заголовок, описание, фраза, разметка и SEO по адресу.
const W = [
  { word: '학교', pron: '학꾜', pos: 'существительное', level: 'начальный' },
  { word: '교습소', pron: '교습쏘', pos: 'существительное', level: 'нет' },
]

describe('русско-корейские страницы: тексты для поисковиков', () => {
  it('заголовок с корейским словом, описание 60–175 знаков', () => {
    expect(ruTitle('школа', W)).toBe('школа по-корейски: 학교, 교습소, перевод и примеры · 우리말')
    const d = ruDescription('школа', W)
    expect(d.length).toBeGreaterThan(60)
    expect(d.length).toBeLessThanOrEqual(175)
    expect(d).toContain('학교 [학꾜]')
  })

  it('фраза: главное слово с чтением, частью речи и уровнем, остальное вариантами; без слов пусто', () => {
    expect(ruLead('школа', W)).toBe('По-корейски «школа» будет 학교 [학꾜] (существительное, начальный уровень). Ещё варианты: 교습소.')
    expect(ruLead('школа', [])).toBe('')
  })

  it('хлебные крошки: словарь, русско-корейский, страница', () => {
    const ld = ruJsonLd('школа', 'https://korean.meeymirita.ru/ru/%D1%88%D0%BA%D0%BE%D0%BB%D0%B0')
    expect(ld['@type']).toBe('BreadcrumbList')
    expect(ld.itemListElement.map(i => i.position)).toEqual([1, 2, 3])
    expect(ld.itemListElement[2]!.name).toBe('школа по-корейски')
  })

  it('SEO по адресу: указатель /ru и страница слова получают свои заголовки', () => {
    expect(seoFor('/ru').title).toContain('Русско-корейский словарь')
    expect(seoFor('/ru/%D1%88%D0%BA%D0%BE%D0%BB%D0%B0').title).toBe('школа по-корейски: перевод и примеры · 우리말')
  })
})
