import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import RuleView from '@/views/korean/RuleView.vue'

describe('«Потренировать правило»', () => {
  it('без выбранной карточки показывает подсказку и список правил', async () => {
    const w = await mountSuspended(RuleView, { route: '/game/home?game=rule' })
    expect(w.text()).toContain('Выбери правило')
    const options = w.findAll('option')
    expect(options.length).toBeGreaterThan(20)
    expect(w.findAll('optgroup').map(g => g.attributes('label'))).toEqual(['Мои карточки', 'Часть 1', 'Часть 2'])
    expect(options.some(o => o.attributes('value') === 'when_e')).toBe(true)
    expect(options.some(o => o.attributes('value') === 'too_do')).toBe(true)
  })

  it('с карточкой из адреса показывает серию заданий и ссылку на карточку', async () => {
    const w = await mountSuspended(RuleView, { route: '/game/home?game=rule&g=when_e' })
    const html = w.html()
    expect(html).toContain('/korean/grammar')
    expect(w.text()).not.toContain('Выбери правило из списка')
    // первое задание серии: вопрос и несколько кнопок-вариантов
    expect(w.findAll('button').length).toBeGreaterThan(3)
  })
})
