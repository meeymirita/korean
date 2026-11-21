import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogView from '@/views/korean/VlogView.vue'
import { VLOGS } from '@/data/korean/vlogs'

// «Влог»: список видео, открытие по адресу ?v=, перевод по нажатию, свой файл видео или плеер ютуба во встроенном окне.
afterEach(() => vi.unstubAllGlobals())

describe('«Влог»', () => {
  it('без ?v= показывает список влогов', async () => {
    localStorage.clear()
    const w = await mountSuspended(VlogView, { route: '/korean/vlog' })
    expect(w.findAll('.vl-card').length).toBe(VLOGS.length)
    expect(w.find('iframe').exists()).toBe(false)
  })

  it('с ?v= и без файла на сервере показывает плеер ютуба, фразы и открывает перевод по нажатию', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const v = VLOGS[0]!
    const w = await mountSuspended(VlogView, { route: `/korean/vlog?v=${v.id}` })
    await flushPromises()
    expect(w.findAll('.vl-line').length).toBe(v.lines.length)
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
    const v = VLOGS[0]!
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
