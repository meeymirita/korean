import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GrammarView from '@/views/korean/GrammarView.vue'
import { G } from '@/data/korean/grammar'

// «Что впереди»: карточки-заглушки во «Моих карточках», значок «впереди» и фильтр.
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => true, isGuest: () => false, bearer: () => 'токен' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

// во «Моих карточках» (1A) только заглушки не из книги 1B: те лежат во вкладке «1B»
const AHEAD = G.filter(g => g.ahead && !g.bk?.startsWith('1B '))
beforeEach(() => {
  sessionStorage.clear()
})

describe('страница грамматики: что впереди', () => {
  it('заглушки видны во «Моих карточках» со значком «впереди», а не «ещё рано»', async () => {
    const w = await mountSuspended(GrammarView)
    await flushPromises()
    // по умолчанию галочка «пройдено» включена и заглушек не видно; без неё они на месте
    const passed = w.findAll('label.gdone input').find(i => i.element.parentElement?.textContent?.includes('пройдено'))!
    expect((passed.element as HTMLInputElement).checked).toBe(true)
    expect(w.findAll('button.gc').filter(c => (c.element as HTMLElement).style.display !== 'none').some(c => c.text().includes('впереди'))).toBe(false)
    await passed.setValue(false)
    await flushPromises()
    const cards = w.findAll('button.gc').filter(c => (c.element as HTMLElement).style.display !== 'none')
    const aheadCards = cards.filter(c => c.text().includes('впереди'))
    expect(aheadCards.length).toBe(AHEAD.length)
    expect(aheadCards.every(c => !c.text().includes('ещё рано'))).toBe(true)
    expect(w.text()).toContain('-고 싶다')
  })

  it('фильтр «что впереди» оставляет только заглушки', async () => {
    const w = await mountSuspended(GrammarView)
    await flushPromises()
    const box = w.findAll('label.gdone input').find(i => i.element.parentElement?.textContent?.includes('что впереди'))!
    await box.setValue(true)
    await flushPromises()
    const cards = w.findAll('button.gc').filter(c => (c.element as HTMLElement).style.display !== 'none')
    expect(cards.length).toBe(AHEAD.length)
    expect(cards.every(c => c.text().includes('впереди'))).toBe(true)
  })
})

describe('страница грамматики: вкладка 1B', () => {
  const B1 = G.filter(g => g.bk?.startsWith('1B '))
  it('в книге 1B 32 пункта: у каждого место «1B единица-урок №», заглушки лежат только во вкладке «1B»', () => {
    // по оглавлению 1B: единицы 9–16, 8 единиц × 4 пункта
    expect(B1.length).toBe(32)
    expect(B1.every(g => /^1B \d+-\d \S$/.test(g.bk!) && g.ahead)).toBe(true)
    expect(new Set(B1.map(g => g.bk)).size).toBe(B1.length)
  })
  it('вкладка «1B» собирает книгу по порядку, «Мои карточки» без неё', async () => {
    const w = await mountSuspended(GrammarView)
    await flushPromises()
    const passed = w.findAll('label.gdone input').find(i => i.element.parentElement?.textContent?.includes('пройдено'))!
    await passed.setValue(false)
    await flushPromises()
    const tab = w.findAll('button.gpart').find(b => b.text().startsWith('1B'))!
    expect(tab.text()).toContain('Книга 1B')
    await tab.trigger('click')
    await flushPromises()
    const cards = w.findAll('button.gc').filter(c => (c.element as HTMLElement).style.display !== 'none')
    expect(cards.length).toBe(B1.length)
    expect(cards[0]!.text()).toContain('1B · 9-1')
    expect(cards.at(-1)!.text()).toContain('1B · 16-2')
  })
})
