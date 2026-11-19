import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GrowthView from '@/views/GrowthView.vue'
import { GROWTH } from '@/data/growth'

describe('«Рост платформы»', () => {
  it('рисует график: линия, цветок на каждое ключевое событие, столбик на каждый день', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    expect(w.find('h1').text()).toBe('Рост платформы')
    expect(w.find('path.line').attributes('d')).toMatch(/^M[\d. ]+C/)
    expect(w.findAll('.bloom').length).toBe(GROWTH.marks.length)
    expect(w.findAll('.bar').length).toBe(GROWTH.days.length)
    expect(w.findAll('.gl').length).toBeGreaterThan(3)
    expect(w.find('.count').text()).toContain('коммитов')
  })

  it('события доступны текстом для чтения (не только графикой)', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    expect(w.findAll('.sr-only li').length).toBe(GROWTH.marks.length)
    expect(w.find('.sr-only').text()).toContain(GROWTH.marks[0]!.title)
  })

  it('есть ссылки на историю и кнопки перехода к началу и к итогу', async () => {
    const w = await mountSuspended(GrowthView, { route: '/growth' })
    expect(w.find('a[href="/history"]').exists()).toBe(true)
    expect(w.findAll('.top .jump').length).toBe(2)
    expect(w.find('.fin').text()).toContain('ключевых событий')
  })
})
