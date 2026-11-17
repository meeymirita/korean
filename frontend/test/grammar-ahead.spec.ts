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

const AHEAD = G.filter(g => g.ahead)
beforeEach(() => {
  sessionStorage.clear()
})

describe('страница грамматики: что впереди', () => {
  it('заглушки видны во «Моих карточках» со значком «впереди», а не «ещё рано»', async () => {
    const w = await mountSuspended(GrammarView)
    await flushPromises()
    const cards = w.findAll('button.gc').filter(c => c.isVisible())
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
    const cards = w.findAll('button.gc').filter(c => c.isVisible())
    expect(cards.length).toBe(AHEAD.length)
    expect(cards.every(c => c.text().includes('впереди'))).toBe(true)
  })
})
