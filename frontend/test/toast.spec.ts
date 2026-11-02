import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useToastStore } from '@/stores/toast'

describe('плашки (стор)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })
  afterEach(() => vi.useRealTimers())

  it('плашка появляется и сама исчезает', () => {
    const t = useToastStore()
    t.ok('Готово')
    expect(t.items).toHaveLength(1)
    vi.advanceTimersByTime(3300)
    expect(t.items).toHaveLength(0)
  })

  it('одинаковое сообщение подряд не множится', () => {
    const t = useToastStore()
    t.error('Нет связи')
    t.error('Нет связи')
    expect(t.items).toHaveLength(1)
  })

  it('одновременно не больше четырёх', () => {
    const t = useToastStore()
    for (let i = 0; i < 6; i++) t.info(`m${i}`)
    expect(t.items).toHaveLength(4)
    expect(t.items[0]!.text).toBe('m2')
  })
})
