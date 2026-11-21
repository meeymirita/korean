import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogView from '@/views/korean/VlogView.vue'
import { VLOGS } from '@/data/korean/vlogs'
import { VLOG_PLAN } from '@/data/korean/vlog-plan'
/** Первая вкладка — Jaerim: видео без поля author */
const MAIN = VLOG_PLAN.filter(p => !p.author)

/** вход подменён: настоящий без сервера невозможен */
const who = vi.hoisted(() => ({ owner: true }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { isGuest: () => !who.owner, bearer: () => 'токен сеанс' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

// «Влог»: список видео, открытие по адресу ?v=, перевод по нажатию, свой файл видео или плеер ютуба во встроенном окне.
afterEach(() => vi.unstubAllGlobals())

describe('«Влог»', () => {
  it('без ?v= показывает список: все влоги плейлиста, готовые открываются, остальные заглушки', async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ watched: [] }), { status: 200 })))
    const w = await mountSuspended(VlogView, { route: '/korean/vlog' })
    await flushPromises()
    expect(w.find('.page-head').exists()).toBe(true)
    const cards = w.findAll('.vl-card')
    expect(cards.length).toBe(MAIN.length)
    expect(cards.filter(c => !(c.element as HTMLButtonElement).disabled).length).toBe(VLOGS.length)
    expect(w.findAll('.vl-item.soon').length).toBe(MAIN.length - VLOGS.length)
    expect(w.find('iframe').exists()).toBe(false)
  })

  it('при наведении на карточку появляется окошко с описанием и цифрами; у заглушки пометка «ещё готовятся»', async () => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ watched: [] }), { status: 200 })))
    const w = await mountSuspended(VlogView, { route: '/korean/vlog' })
    await flushPromises()
    const items = w.findAll('.vl-item')
    expect(w.find('.vl-pop').exists()).toBe(false)
    const ready = items.findIndex(i => !i.classes().includes('soon'))
    await items[ready]!.trigger('mouseenter')
    expect(w.findAll('.vl-pop').length).toBe(1)
    expect(w.find('.vl-pop').text()).toContain('фраз')
    expect(w.find('.vl-pop-about').text().length).toBeGreaterThan(40)
    await items[ready]!.trigger('mouseleave')
    expect(w.find('.vl-pop').exists()).toBe(false)
    // заглушки (видео без текста) показывают пометку; если все влоги готовы, заглушек в списке нет
    const soon = items.findIndex(i => i.classes().includes('soon'))
    if (soon >= 0) {
      await items[soon]!.trigger('mouseenter')
      expect(w.find('.vl-pop').text()).toContain('ещё готовятся')
    }
  })

  it('галочка «просмотрено» сохраняется на сервере; гостю галочек нет', async () => {
    localStorage.clear()
    const put = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PUT' ? put(url, init) : new Response(JSON.stringify({ watched: [] }), { status: 200 }))))
    who.owner = true
    const w = await mountSuspended(VlogView, { route: '/korean/vlog' })
    await flushPromises()
    const boxes = w.findAll('.vl-watch input')
    expect(boxes.length).toBe(MAIN.length)
    await boxes[1]!.setValue(true)
    await flushPromises()
    expect(put).toHaveBeenCalledOnce()
    expect(JSON.parse((put.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ watched: [MAIN[1]!.yt] })
    expect(w.findAll('.vl-item')[1]!.classes()).toContain('seen')
    who.owner = false
    const g = await mountSuspended(VlogView, { route: '/korean/vlog' })
    await flushPromises()
    expect(g.find('.vl-watch').exists()).toBe(false)
    who.owner = true
  })

  it('с ?v= и без файла на сервере показывает плеер ютуба, фразы и открывает перевод по нажатию', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const v = VLOGS[0]!
    const w = await mountSuspended(VlogView, { route: `/korean/vlog?v=${v.id}` })
    await flushPromises()
    expect(w.findAll('.vl-line').length).toBe(v.lines.length)
    // у открытого влога шапки раздела нет: сверху «← Все влоги», название и автор
    expect(w.find('.page-head').exists()).toBe(false)
    expect(w.find('.vl-back').text()).toContain('Все влоги')
    expect(w.find('.vl-title').text()).toBe(v.title)
    expect(w.find('.vl-ru').exists()).toBe(false)
    await w.find('.vl-ru-btn').trigger('click')
    expect(w.find('.vl-ru').text()).toBe(v.lines[0]!.ru)
    // перевод стоит под текстом, а кнопка после него
    const body = w.find('.vl-body').element
    const order = [...body.children].map(c => c.className)
    expect(order[0]).toBe('vl-ko')
    expect(order[1]).toBe('vl-ru')
    expect(order.at(-1)).toBe('vl-ru-btn')
    expect(w.find('iframe').attributes('src')).toContain(`youtube-nocookie.com/embed/${v.yt}`)
    expect(w.find('video').exists()).toBe(false)
  })

  it('чип грамматики под фразой открывает карточку темы; нажатие ещё раз закрывает', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const v = VLOGS.find(x => x.id === 'bukchon')!
    const i = v.lines.findIndex(l => l.ko.includes('갈 거예요'))
    const w = await mountSuspended(VlogView, { route: `/korean/vlog?v=${v.id}` })
    await flushPromises()
    const chip = w.findAll('.vl-line')[i]!.findAll('.vl-gr-chip').find(c => c.text().includes('거예요'))!
    expect(chip).toBeTruthy()
    await chip.trigger('click')
    expect(w.find('.vl-gram').text()).toContain('пройдено')
    expect(w.find('.vl-gram .vl-formula').text()).toContain('основа глагола')
    await chip.trigger('click')
    expect(w.find('.vl-gram').exists()).toBe(false)
  })

  it('если файл видео есть на сервере, играет свой <video>, а не ютуб', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: '/api/video/vlog/x/file?e=1&s=2' }), { status: 200 })))
    const v = VLOGS[0]!
    const w = await mountSuspended(VlogView, { route: `/korean/vlog?v=${v.id}` })
    await flushPromises()
    expect(w.find('video').attributes('src')).toBe('/api/video/vlog/x/file?e=1&s=2')
    expect(w.find('iframe').exists()).toBe(false)
  })
})
