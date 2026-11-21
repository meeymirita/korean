import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogView from '@/views/korean/VlogView.vue'
import { VLOGS } from '@/data/korean/vlogs'

// «Влог»: список видео, открытие по адресу ?v=, перевод по нажатию, плеер ютуба во встроенном окне.
describe('«Влог»', () => {
  it('без ?v= показывает список влогов', async () => {
    localStorage.clear()
    const w = await mountSuspended(VlogView, { route: '/korean/vlog' })
    expect(w.findAll('.vl-card').length).toBe(VLOGS.length)
    expect(w.find('iframe').exists()).toBe(false)
  })

  it('с ?v= показывает плеер, фразы и открывает перевод по нажатию', async () => {
    const v = VLOGS[0]!
    const w = await mountSuspended(VlogView, { route: `/korean/vlog?v=${v.id}` })
    expect(w.findAll('.vl-line').length).toBe(v.lines.length)
    expect(w.find('.vl-ru').exists()).toBe(false)
    await w.find('.vl-ru-btn').trigger('click')
    expect(w.find('.vl-ru').text()).toBe(v.lines[0]!.ru)
    const src = w.find('iframe').attributes('src') ?? ''
    expect(src).toContain(`youtube-nocookie.com/embed/${v.yt}`)
  })
})
