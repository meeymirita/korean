import { describe, expect, it } from 'vitest'
import { seededRandom, withSeed } from '@/lib/seeded'
import { SITE, canonicalOf, indexablePaths, privatePaths, seoFor, seoMetaFor } from '@/data/seo'

describe('случайное от зерна (SSR без расхождений)', () => {
  it('одно зерно даёт одну и ту же последовательность', () => {
    const a = seededRandom('день-1')
    const b = seededRandom('день-1')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('withSeed подменяет Math.random и возвращает его обратно', () => {
    const orig = Math.random
    const x = withSeed('s', () => Math.random())
    const y = withSeed('s', () => Math.random())
    expect(x).toBe(y)
    expect(Math.random).toBe(orig)
  })
})

describe('SEO страниц', () => {
  it('у каждой открытой страницы есть заголовок до 75 символов и описание 60–190', () => {
    for (const p of indexablePaths()) {
      const s = seoFor(p)
      expect(s.title.length, p).toBeLessThanOrEqual(75)
      expect(s.description.length, p).toBeGreaterThanOrEqual(60)
      expect(s.description.length, p).toBeLessThanOrEqual(190)
    }
  })

  it('открытые и закрытые страницы не пересекаются', () => {
    const closed = new Set(privatePaths())
    for (const p of indexablePaths()) expect(closed.has(p), p).toBe(false)
  })

  it('canonical строится от адреса сайта без хвостового слэша', () => {
    expect(canonicalOf('/')).toBe(`${SITE}/`)
    expect(canonicalOf('/about/')).toBe(`${SITE}/about`)
    expect(seoMetaFor('/about')).toBeTruthy()
  })
})
