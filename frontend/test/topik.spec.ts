import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { FORMAT, levelOf, neededShare, readingRange, totalRange, vocabMargin } from '@/data/korean/topik'
import { TOPIK_POOL } from '@/data/korean/topik-pool'
import TopikView from '@/views/korean/TopikView.vue'

describe('прогноз TOPIK I: расчёт', () => {
  it('факты экзамена: 70 вопросов, 200 баллов, пороги 80 и 140', () => {
    expect(FORMAT.listening.questions + FORMAT.reading.questions).toBe(70)
    expect(FORMAT.perPart * 2).toBe(FORMAT.max)
    expect([FORMAT.level1, FORMAT.level2]).toEqual([80, 140])
    expect([levelOf(79), levelOf(80), levelOf(139), levelOf(140)]).toEqual([0, 1, 1, 2])
  })
  it('без теста слов прогноза нет; чем больше знаешь, тем выше балл; диапазон содержит середину', () => {
    expect(readingRange({ vocab: null, vocabN: 0, grammar: 0.5, accuracy: null })).toBeNull()
    const lo = readingRange({ vocab: 0.3, vocabN: 40, grammar: 0.3, accuracy: null })!
    const hi = readingRange({ vocab: 0.9, vocabN: 40, grammar: 0.9, accuracy: 0.9 })!
    expect(hi.mid).toBeGreaterThan(lo.mid)
    for (const r of [lo, hi]) expect(r.lo <= r.mid && r.mid <= r.hi && r.lo >= 0 && r.hi <= 100).toBe(true)
  })
  it('аудирование ниже даёт меньше баллов; сумма не больше 200; больше слов в тесте даёт узкий диапазон', () => {
    const r = readingRange({ vocab: 0.7, vocabN: 40, grammar: 0.7, accuracy: 0.8 })!
    expect(totalRange(r, 'lower').mid).toBeLessThan(totalRange(r, 'same').mid)
    expect(totalRange({ lo: 100, mid: 100, hi: 100 }, 'same').hi).toBeLessThanOrEqual(200)
    expect(vocabMargin(0.6, 160)).toBeLessThan(vocabMargin(0.6, 40))
  })
  it('нужная доля для 140 баллов больше, чем для 80; допущение «ниже» требует больше', () => {
    expect(neededShare(140, 'same')).toBeGreaterThan(neededShare(80, 'same'))
    expect(neededShare(80, 'lower')).toBeGreaterThan(neededShare(80, 'same'))
  })
  it('список слов для теста: без повторов, у каждого слова есть перевод', () => {
    expect(TOPIK_POOL.length).toBeGreaterThan(500)
    expect(new Set(TOPIK_POOL.map(w => w[1])).size).toBe(TOPIK_POOL.length)
    expect(TOPIK_POOL.every(w => w[3].trim() && /[가-힣]/.test(w[1]))).toBe(true)
  })
})

describe('прогноз TOPIK I: страница', () => {
  it('тест слов проходится до конца и даёт прогноз; результат сохраняется', async () => {
    localStorage.removeItem('topik_v1')
    const w = await mountSuspended(TopikView)
    await flushPromises()
    expect(w.find('.verdict').text()).toContain('Пройди тест')
    await w.find('button.go').trigger('click')
    for (let i = 0; i < 40; i++) {
      await w.findAll('.acts button')[i % 2]!.trigger('click')
    }
    await flushPromises()
    expect(w.find('.verdict').text()).toMatch(/Сейчас около \d+ из 200/)
    expect(JSON.parse(localStorage.getItem('topik_v1')!).tests.length).toBe(1)
    localStorage.removeItem('topik_v1')
  })
})
