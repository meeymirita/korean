import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WeakSpotCard from '@/components/korean/WeakSpotCard.vue'
import { G } from '@/data/korean/grammar'
import { useProgressStore } from '@/stores/progress'

// Карточка «Слабое место дня» в «Сегодня».
const who = vi.hoisted(() => ({ unlocked: true, owner: true }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => who.unlocked, isGuest: () => !who.owner }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

const card = G.find(g => g.st === 'ok')!
const answers = (n: number, bad: number) => Array.from({ length: n }, (_, i) => ({ t: Date.now() - 3_600_000, w: null, ok: i >= bad, s: 'trainer', d: { g: card.id } }))

beforeEach(() => {
  who.unlocked = true
  who.owner = true
  useProgressStore().data.log = []
})

describe('карточка «Слабое место дня»', () => {
  it('со слабым правилом показывает его, точность и кнопку на правило карточки', async () => {
    useProgressStore().data.log = answers(10, 6)
    const w = await mountSuspended(WeakSpotCard)
    expect(w.text()).toContain('Слабое место дня')
    expect(w.text()).toContain(card.ru)
    expect(w.text()).toContain('Верно 40%')
    expect(w.text()).toContain('6 ошибок из 10 за неделю')
    expect(w.find('a').attributes('href')).toContain(`game=rule&g=${card.id}`)
  })

  it('без слабых правил карточки нет, гостю и без входа тоже', async () => {
    expect((await mountSuspended(WeakSpotCard)).find('.ws').exists()).toBe(false)
    useProgressStore().data.log = answers(10, 6)
    who.owner = false
    expect((await mountSuspended(WeakSpotCard)).find('.ws').exists()).toBe(false)
    who.owner = true
    who.unlocked = false
    expect((await mountSuspended(WeakSpotCard)).find('.ws').exists()).toBe(false)
  })
})
