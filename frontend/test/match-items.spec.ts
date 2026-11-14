import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import MatchGame from '@/components/korean/MatchGame.vue'
import { pool } from '@/data/korean/trainer'
import { useProgressStore } from '@/stores/progress'

// Предметы Юны в «Найди пару»: подсказка подсвечивает верную пару, второй шанс отменяет ошибку (docs/shop.md).
const bag = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return { stock: reactive<Record<string, number>>({}), used: [] as string[] }
})
vi.mock('@/composables/useItemBar', async () => {
  const { ref } = await import('vue')
  return {
    useItemBar: () => ({
      owner: ref(true),
      shop: { busy: false },
      count: (id: string) => bag.stock[id] ?? 0,
      use: async (id: string) => {
        if (!bag.stock[id]) return false
        bag.stock[id]--
        bag.used.push(id)
        return true
      },
    }),
  }
})
const setStock = (s: Record<string, number>) => {
  for (const k of Object.keys(bag.stock)) delete bag.stock[k]
  Object.assign(bag.stock, s)
  bag.used.length = 0
}
const words = pool('adjectives').slice(0, 4)
const mount = () => mountSuspended(MatchGame, { props: { words, showReading: false } })
const card = (w: ReturnType<typeof mount> extends Promise<infer T> ? T : never, side: 'l' | 'r', id: number) => w.find(`[data-side="${side}"][data-id="${id}"]`)

describe('«Найди пару»: предметы из магазина', () => {
  it('без предметов панели нет', async () => {
    setStock({})
    const w = await mount()
    expect(w.findAll('.rs-item').length).toBe(0)
    w.unmount()
  })

  it('подсказка подсвечивает слово и его перевод', async () => {
    setStock({ hint: 1 })
    const w = await mount()
    await w.find('.rs-item').trigger('click')
    await flushPromises()
    expect(bag.used).toEqual(['hint'])
    expect(w.findAll('.mg-hint').length).toBe(2)
    const [a, b] = w.findAll('.mg-hint')
    expect(a!.attributes('data-id')).toBe(b!.attributes('data-id'))
    expect(w.findAll('.rs-item').length).toBe(0) // запас кончился
    w.unmount()
  })

  it('второй шанс: неверная пара не записана, «Отменить ошибку» снимает счётчик', async () => {
    setStock({ second: 1 })
    const progress = useProgressStore()
    const w = await mount()
    const before = progress.data.log.length
    const ids = w.findAll('[data-side="l"]').map(c => Number(c.attributes('data-id')))
    await card(w, 'l', ids[0]!).trigger('click')
    await card(w, 'r', ids[1]!).trigger('click')
    expect(w.text()).toContain('ошибок: 1')
    expect(progress.data.log.length).toBe(before)
    await w.findAll('.rs-item').find(b => b.text().includes('Отменить'))!.trigger('click')
    await flushPromises()
    expect(bag.used).toEqual(['second'])
    expect(w.text()).toContain('ошибок: 0')
    expect(progress.data.log.length).toBe(before)
    w.unmount()
  })

  it('если следующую пару выбрали, ошибка записывается', async () => {
    setStock({ second: 1 })
    const progress = useProgressStore()
    const w = await mount()
    const before = progress.data.log.length
    const ids = w.findAll('[data-side="l"]').map(c => Number(c.attributes('data-id')))
    await card(w, 'l', ids[0]!).trigger('click')
    await card(w, 'r', ids[1]!).trigger('click')
    expect(progress.data.log.length).toBe(before)
    await new Promise(r => setTimeout(r, 500)) // подсветка ошибки гаснет, можно выбирать дальше
    await card(w, 'l', ids[2]!).trigger('click')
    await card(w, 'r', ids[2]!).trigger('click')
    expect(progress.data.log.length).toBe(before + 2)
    const oks = progress.data.log.slice(0, 2).map(e => e.ok).sort()
    expect(oks).toEqual([false, true])
    expect(w.findAll('.rs-item').length).toBe(0)
    w.unmount()
  })
})
