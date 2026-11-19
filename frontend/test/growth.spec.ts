import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GrowthView from '@/views/GrowthView.vue'
import { GROWTH } from '@/data/growth'

describe('«Рост платформы»', () => {
  it('рисует ленту: блок на каждое ключевое событие, лоза, веточка и цветок на каждый блок', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    expect(w.find('h1').text()).toBe('Рост платформы')
    expect(w.findAll('.blk').length).toBe(GROWTH.marks.length)
    expect(w.findAll('.blk.r').length).toBeGreaterThan(0)
    expect(w.findAll('.blk.l').length).toBeGreaterThan(0)
    expect(w.find('path.vine').exists()).toBe(true)
    expect(w.findAll('.twig').length).toBe(GROWTH.marks.length)
    expect(w.findAll('.fl').length).toBe(GROWTH.marks.length)
  })

  it('события лежат в разметке текстом (читаются и без графики)', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    expect(w.find('.blk').text()).toContain(GROWTH.marks[0]!.title)
    expect(w.text()).toContain(GROWTH.marks[GROWTH.marks.length - 1]!.summary)
  })

  it('есть ссылки на историю, кнопки перехода, смена темы и итоги', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    expect(w.find('a[href="/history"]').exists()).toBe(true)
    expect(w.findAll('.gr-top .jump').length).toBe(3)
    expect(w.find('.theme-btn').exists()).toBe(true)
    expect(w.find('.gr-fin').text()).toContain('ключевых событий')
  })
})
