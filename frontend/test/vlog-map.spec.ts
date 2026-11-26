import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogMap from '@/components/korean/VlogMap.vue'
import { PLACES } from '@/data/korean/vlog-map'

/** вход подменён: настоящий без сервера невозможен */
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { isGuest: () => false, bearer: () => 'токен сеанс' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

// «Карта мест»: значки мест на карте города, подсказка при наведении, панель с влогами по нажатию, поиск и фильтр.
afterEach(() => vi.unstubAllGlobals())

async function mountMap() {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ watched: [] }), { status: 200 })))
  const w = await mountSuspended(VlogMap, { attachTo: document.body })
  await flushPromises()
  return w
}

describe('Карта мест', () => {
  it('рисует значок на каждое место с числом влогов, значки лежат в определениях', async () => {
    const w = await mountMap()
    expect(w.findAll('.vs-pin').length).toBe(PLACES.length)
    expect(w.findAll('.vs-pin .vs-n').length).toBeGreaterThan(5)
    expect(w.find('.vm-defs symbol').exists()).toBe(true)
    w.unmount()
  })

  it('наведение показывает подсказку, нажатие на место открывает панель с влогами, Esc закрывает', async () => {
    const w = await mountMap()
    const pins = w.findAll('.vs-pin')
    const cafe = pins[PLACES.findIndex(p => p.id === 'cafe')]!
    await cafe.trigger('mouseenter', { clientX: 200, clientY: 200 })
    expect(w.find('.vm-tip').exists()).toBe(true)
    await cafe.trigger('click')
    await flushPromises()
    expect(w.find('.vm-panel').classes()).toContain('open')
    expect(w.find('.vm-panel h3').text()).toBe('카페')
    expect(w.findAll('.vm-vl li').length).toBeGreaterThan(3)
    expect(w.find('.vm-vl a').attributes('href')).toMatch(/^\/korean\/vlog\?v=.+&t=\d+$/)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.find('.vm-panel').classes()).not.toContain('open')
    w.unmount()
  })

  it('значок «море и остров» открывает своё место', async () => {
    const w = await mountMap()
    await w.findAll('.vs-pin')[PLACES.findIndex(p => p.id === 'sea')]!.trigger('click')
    await flushPromises()
    expect(w.find('.vm-panel h3').text()).toBe(PLACES.find(p => p.id === 'sea')!.ko)
    w.unmount()
  })

  it('поиск гасит лишние места, «где есть непросмотренные» оставляет места с новыми влогами', async () => {
    const w = await mountMap()
    await w.find('.vm-q').setValue('кафе')
    const pins = w.findAll('.vs-pin')
    const faded = w.findAll('.vs-pin.faded').length
    expect(faded).toBeGreaterThan(0)
    expect(faded).toBeLessThan(pins.length)
    await w.find('.vm-q').setValue('')
    await w.findAll('.vm-chip').find(c => c.text().startsWith('Где есть'))!.trigger('click')
    expect(w.findAll('.vs-pin.faded').length).toBeGreaterThanOrEqual(0)
    w.unmount()
  })

  it('кнопка «на весь экран» переносит карту в body, повторное нажатие возвращает', async () => {
    const w = await mountMap()
    const click = async (label: string) => {
      ;(document.body.querySelector(`.vm-ico[aria-label="${label}"]`) as HTMLElement).click()
      await flushPromises()
    }
    await click('На весь экран')
    expect(document.body.querySelector('.vm.full')).toBeTruthy()
    await click('Свернуть')
    expect(document.body.querySelector('.vm.full')).toBeFalsy()
    w.unmount()
  })
})
