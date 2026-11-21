import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { analyze, splitCandidates } from '@/data/korean/parse'

// «화가» («художник») раньше разбиралось как «화» («злость») + частица «가», потому что слова не было в словаре сайта.
vi.mock('@/lib/dictApi', async original => {
  const real = await original<typeof import('@/lib/dictApi')>()
  return {
    ...real,
    // большой словарь «знает» только слово 책이 (для проверки показа подсказки)
    searchDict: async (q: string) => ({ query: q, hits: q === '책이' ? [{ word: '책이', ru: 'книга; пример', tr: ['книга'], pos: 'существительное', level: 'начальный' }] : [], total: 0, limit: 20, offset: 0, facets: { level: {}, pos: {} } }),
  }
})

describe('разбор: слово или слово + частица', () => {
  it('«화가» теперь одно слово «художник», а не «화» + «가»', () => {
    const segs = analyze('안나 씨는 화가예요.')
    const w = segs.find(s => s.text === '화가')
    expect(w?.type).toBe('word')
    expect(w?.gloss).toContain('художник')
    expect(segs.some(s => s.text === '화' || (s.type === 'particle' && s.text === '가'))).toBe(false)
  })
  it('пары «слово из одного слога + частица» находятся и без повторов; обычные сочетания с длинным словом нет', () => {
    expect(splitCandidates(analyze('저는 책이 좋아요.'))).toEqual(['저는', '책이'])
    expect(splitCandidates(analyze('친구가 학교에 가요.'))).toEqual([])
  })
  it('подсказка в разборе появляется только когда большой словарь знает целое слово', async () => {
    const w = await mountSuspended(SentenceBreakdown, { props: { sentence: '저는 책이 좋아요.' } })
    await flushPromises()
    await new Promise(r => setTimeout(r, 20))
    await flushPromises()
    const note = w.find('.bd-maybe')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('«책이» может быть одним словом')
    expect(note.text()).not.toContain('«저는»')
    const plain = await mountSuspended(SentenceBreakdown, { props: { sentence: '친구가 학교에 가요.' } })
    await flushPromises()
    expect(plain.find('.bd-maybe').exists()).toBe(false)
  })
})
