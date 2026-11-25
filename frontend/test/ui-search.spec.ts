import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiSearch from '@/components/ui/UiSearch.vue'

describe('UiSearch', () => {
  it('показывает значение, отдаёт ввод через update:modelValue', async () => {
    const w = mount(UiSearch, { props: { modelValue: 'кафе' }, attrs: { placeholder: 'Найти', 'aria-label': 'Поиск' } })
    const input = w.find('input')
    expect(input.element.value).toBe('кафе')
    expect(input.attributes('type')).toBe('search')
    expect(input.attributes('placeholder')).toBe('Найти')
    expect(input.attributes('aria-label')).toBe('Поиск')
    await input.setValue('еда')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['еда'])
  })

  it('class и style остаются на обёртке, а не на поле', () => {
    const w = mount(UiSearch, { attrs: { class: 'mine', style: 'width: 200px' } })
    expect(w.classes()).toContain('mine')
    expect(w.classes()).toContain('ui-search--md')
    expect(w.attributes('style')).toContain('200px')
    expect(w.find('input').classes()).not.toContain('mine')
  })

  it('события на поле (например Esc) доходят, размер даёт класс', async () => {
    let esc = 0
    const w = mount(UiSearch, { props: { size: 'sm' }, attrs: { onKeydown: () => esc++ } })
    await w.find('input').trigger('keydown', { key: 'Escape' })
    expect(esc).toBe(1)
    expect(w.classes()).toContain('ui-search--sm')
  })
})
