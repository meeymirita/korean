import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogStudyView from '@/views/korean/VlogStudyView.vue'
import VlogView from '@/views/korean/VlogView.vue'

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

// «Разбор влога»: один проход рассказа, справка по новой грамматике, слова; кнопка «разбор» у карточки влога.
afterEach(() => vi.unstubAllGlobals())
const emptySearch = () => new Response(JSON.stringify({ query: '', hits: [], total: 0, limit: 20, offset: 0, facets: { level: {}, pos: {} } }), { status: 200 })

describe('«Разбор влога»', () => {
  it('показывает один проход рассказа, блок справки и слова', async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => emptySearch()))
    const w = await mountSuspended(VlogStudyView, { route: '/korean/vlog-study?v=choisusu-hobby' })
    await flushPromises()
    expect(w.findAll('.vs-line').length).toBe(18)
    expect(w.find('.vs-by').text()).toContain('звучит 4 раза')
    expect(w.findAll('.vs-line .vs-ru').length).toBe(18)
    const fresh = w.findAll('.vs-fresh .vs-g-head b').map(b => b.text())
    expect(fresh).toEqual(['-고', '-고 싶다', '-(으)면서', '-는 것'])
    expect(w.find('.vs-fresh-note').text()).toContain('нигде не записываются')
    expect(w.findAll('.vs-words li').length).toBeGreaterThan(20)
    const tabs = w.findAll('.vs-tab')
    expect(tabs[0]!.classes()).toContain('on')
    expect(tabs[1]!.attributes('disabled')).toBeDefined()
  })

  it('нажатие на слово открывает карточку с переводом', async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => emptySearch()))
    const w = await mountSuspended(VlogStudyView, { route: '/korean/vlog-study?v=choisusu-hobby' })
    await flushPromises()
    await w.find('.vs-line .cw').trigger('click')
    expect(w.find('.vs-card').exists()).toBe(true)
  })

  it('влога нет в списке разборов: пояснение и ссылка назад', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => emptySearch()))
    const w = await mountSuspended(VlogStudyView, { route: '/korean/vlog-study?v=bukchon' })
    expect(w.text()).toContain('пока не готов')
    expect(w.findAll('.vs-line').length).toBe(0)
  })

  it('в списке влогов кнопка «разбор» только у первого влога', async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ watched: [] }), { status: 200 })))
    const w = await mountSuspended(VlogView, { route: '/korean/vlog' })
    await flushPromises()
    const links = w.findAll('.vl-study')
    expect(links.length).toBe(1)
    expect(links[0]!.attributes('href')).toBe('/korean/vlog-study?v=choisusu-hobby')
  })
})
