import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiPlay from '@/components/ui/UiPlay.vue'

describe('UiPlay', () => {
  it('круг нужного размера и цвета, скрыт от читалок экрана', () => {
    const w = mount(UiPlay, { props: { color: '#d6488e', size: 26 } })
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.attributes('style')).toContain('26px')
    expect(w.attributes('style')).toContain('#d6488e')
    expect(w.classes()).not.toContain('is-pause')
  })

  it('по умолчанию 32 px и акцентный цвет, режим паузы даёт класс', () => {
    const w = mount(UiPlay, { props: { pause: true } })
    expect(w.attributes('style')).toContain('32px')
    expect(w.attributes('style')).toContain('--ui-accent')
    expect(w.classes()).toContain('is-pause')
  })
})
