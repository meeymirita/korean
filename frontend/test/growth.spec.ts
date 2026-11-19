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

  it('в конце два блока: «обо мне» со ссылкой на Telegram и итог платформы, вокруг них две ветви лозы и цветки', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    await new Promise(r => setTimeout(r, 30))
    expect(w.find('.gr-end .gr-me').exists()).toBe(true)
    expect(w.find('.gr-end .gr-fin').exists()).toBe(true)
    expect(w.find('.gr-me a[href="https://t.me/meeymirita"]').exists()).toBe(true)
    expect(w.find('.gr-fin').text()).toContain('слов в словаре')
    expect(w.findAll('path.br').length).toBe(2)
    expect(w.findAll('.bfl').length).toBe(7)
  })
})
