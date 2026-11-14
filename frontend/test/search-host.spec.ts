import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SearchHost from '@/components/SearchHost.vue'
import { closeSearch, searchOpen } from '@/composables/useSearchWindow'

// Окно поиска подгружается при первом открытии: клавиши живут в лёгкой оболочке SearchHost.
describe('окно поиска: ленивая загрузка', () => {
  afterEach(() => closeSearch())

  it('до открытия окна в разметке нет, ⌘K открывает его, Esc закрывает', async () => {
    const w = await mountSuspended(SearchHost, { attachTo: document.body })
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    expect(searchOpen.value).toBe(true)
    // первая загрузка окна тянет словарь и переводы: в тестовой среде это занимает заметное время
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]'), 'окно загрузилось и показано').not.toBeNull(), { timeout: 15_000 })
    expect(document.querySelector<HTMLInputElement>('.sw input')).not.toBeNull()
    await vi.waitFor(() => expect(document.activeElement, 'при первом открытии фокус сразу в поле').toBe(document.querySelector('.sw input')))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(searchOpen.value).toBe(false)
    w.unmount()
  })

  it('«/» открывает окно, если фокус не в поле ввода', async () => {
    const w = await mountSuspended(SearchHost, { attachTo: document.body })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    expect(searchOpen.value).toBe(true)
    w.unmount()
  })
})
