import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import SyllablesView from '@/views/korean/SyllablesView.vue'
import { useProgressStore } from '@/stores/progress'

// Предметы Юны в «Слогах»: подсказка, 50/50, повтор и второй шанс (docs/shop.md).
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

describe('«Слоги»: предметы из магазина', () => {
  it('без предметов кнопок нет', async () => {
    setStock({})
    const w = await mountSuspended(SyllablesView)
    expect(w.findAll('.rs-item').length).toBe(0)
    w.unmount()
  })

  it('50/50 убирает лишние плитки, после этого кнопка недоступна', async () => {
    setStock({ fifty: 3 })
    const w = await mountSuspended(SyllablesView)
    const need = w.findAll('.sy-bg .sy-slot').length
    const before = w.findAll('.sy-tile').length
    expect(before).toBeGreaterThan(need)
    const btn = () => w.findAll('.rs-item').find(b => b.text().includes('50/50'))!
    await btn().trigger('click')
    await flushPromises()
    expect(bag.used).toEqual(['fifty'])
    expect(w.findAll('.sy-tile').length).toBeLessThan(before)
    expect(w.findAll('.sy-tile').length).toBeGreaterThanOrEqual(need)
    w.unmount()
  })

  it('подсказка называет первый слог и убирает одну лишнюю плитку', async () => {
    setStock({ hint: 1 })
    const w = await mountSuspended(SyllablesView)
    const before = w.findAll('.sy-tile').length
    await w.findAll('.rs-item').find(b => b.text().includes('Подсказка'))!.trigger('click')
    await flushPromises()
    expect(w.find('.rs-hint').text()).toMatch(/начинается с «.+»/)
    expect(w.findAll('.sy-tile').length).toBe(before - 1)
    w.unmount()
  })

  it('повтор переносит задание в конец серии: номер не меняется, перевод другой', async () => {
    setStock({ skip: 1 })
    const w = await mountSuspended(SyllablesView)
    const q = () => w.find('.rs-q').text()
    const first = q()
    await w.findAll('.rs-item').find(b => b.text().includes('Повтор'))!.trigger('click')
    await flushPromises()
    expect(w.find('.rs-bar').text()).toContain('1 из')
    expect(q()).not.toBe(first)
    w.unmount()
  })

  it('второй шанс: неверный ответ не записывается, «Исправить» очищает слоты', async () => {
    setStock({ second: 2 })
    const progress = useProgressStore()
    // собираем плитки в порядке, который почти всегда неверный (с лишней плиткой); если вышло верно, пробуем новое задание
    for (let attempt = 0; attempt < 30; attempt++) {
      const w = await mountSuspended(SyllablesView)
      const need = w.findAll('.sy-bg .sy-slot').length
      const tiles = w.findAll('.sy-tile')
      for (const t of [...tiles].reverse().slice(0, need)) await t.trigger('click')
      await flushPromises()
      const pending = w.findAll('.rs-item').some(b => b.text().includes('Исправить'))
      if (!pending) {
        w.unmount()
        continue
      }
      const logBefore = progress.data.log.length
      expect(w.find('.rs-next').exists(), 'ответ ещё не закрыт').toBe(false)
      await w.findAll('.rs-item').find(b => b.text().includes('Исправить'))!.trigger('click')
      await flushPromises()
      expect(bag.used).toEqual(['second'])
      expect(w.findAll('.sy-slot.filled').length).toBe(0)
      expect(progress.data.log.length, 'ошибка не записана').toBe(logBefore)
      w.unmount()
      return
    }
    throw new Error('за 30 попыток не вышло неверного ответа')
  })

  it('«Оставить ошибку» записывает ответ и закрывает задание', async () => {
    setStock({ second: 1 })
    const progress = useProgressStore()
    for (let attempt = 0; attempt < 30; attempt++) {
      const w = await mountSuspended(SyllablesView)
      const need = w.findAll('.sy-bg .sy-slot').length
      for (const t of [...w.findAll('.sy-tile')].reverse().slice(0, need)) await t.trigger('click')
      await flushPromises()
      const keep = w.findAll('.rs-item').find(b => b.text().includes('Оставить'))
      if (!keep) {
        w.unmount()
        continue
      }
      const logBefore = progress.data.log.length
      await keep.trigger('click')
      await flushPromises()
      expect(progress.data.log.length).toBe(logBefore + 1)
      expect(progress.data.log[0]!.ok).toBe(false)
      expect(w.find('.rs-next').exists()).toBe(true)
      expect(bag.used).toEqual([])
      w.unmount()
      return
    }
    throw new Error('за 30 попыток не вышло неверного ответа')
  })
})
