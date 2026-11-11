import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import SyllablesView from '@/views/korean/SyllablesView.vue'

// «Собери по слогам» после перехода с vuedraggable на общий помощник перетаскивания: нажатия работают как раньше.
describe('«Слоги»: сборка слова нажатием', () => {
  it('плитка встаёт в слот, нажатие на слот возвращает её, заполненные слоты проверяются сами', async () => {
    const w = await mountSuspended(SyllablesView)
    const tiles = () => w.findAll('.sy-tile')
    const slots = () => w.findAll('.sy-slot.filled')
    const need = w.findAll('.sy-bg .sy-slot').length
    expect(need).toBeGreaterThanOrEqual(2)
    expect(tiles().length).toBeGreaterThan(need)

    await tiles()[0]!.trigger('click')
    expect(slots().length).toBe(1)
    expect(tiles()[0]!.classes()).toContain('picked')
    // повторное нажатие на выбранную плитку ничего не добавляет
    await tiles()[0]!.trigger('click')
    expect(slots().length).toBe(1)
    // нажатие на слот возвращает плитку в набор
    await slots()[0]!.trigger('click')
    expect(slots().length).toBe(0)
    expect(tiles()[0]!.classes()).not.toContain('picked')

    for (let i = 0; i < need; i++) await tiles()[i]!.trigger('click')
    await nextTick()
    expect(slots().length).toBe(need)
    expect(w.find('.sy-slots').classes().some(c => c === 'ok' || c === 'bad')).toBe(true)
    expect(w.find('.rs-next').exists()).toBe(true)
    // после проверки слот уже не убрать
    await slots()[0]!.trigger('click')
    expect(slots().length).toBe(need)
    w.unmount()
  })
})
