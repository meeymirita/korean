import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ClipView from '@/views/korean/ClipView.vue'
import { useProgressStore, KNOWN_STREAK } from '@/stores/progress'

// «Вырезка из текста»: подсветка, счётчик, перевод по нажатию, «Очистить»; запросы к словарю подменены.
const hit = (word: string, ru: string) => ({ id: word, word, hom: 1, posKo: '', pos: 'существительное', level: 'начальный', levelRank: 3, pron: '', cat: '', ru, forms: [], wordLen: word.length, senses: [], moreSenses: 0 })

function stubDict(known: Record<string, string>) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const q = decodeURIComponent(new URL(url, 'http://x').searchParams.get('q') ?? '')
    calls.push(q)
    const ru = known[q]
    return new Response(JSON.stringify({ query: q, hits: ru ? [hit(q, ru)] : [], total: ru ? 1 : 0, limit: 20, offset: 0, facets: { level: {}, pos: {} } }), { status: 200 })
  }))
  return calls
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('«Вырезка из текста»', () => {
  it('подсвечивает свои слова по очкам, считает «известно N из M» и показывает перевод по нажатию', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const calls = stubDict({})
    const progress = useProgressStore()
    progress.data.words['가다'] = { ok: KNOWN_STREAK, bad: 0, streak: KNOWN_STREAK, last: Date.now() }
    const w = await mountSuspended(ClipView, { route: '/korean/clip' })
    expect(w.find('.clip-text').exists()).toBe(false)
    await w.find('textarea').setValue('학교에 가요')
    expect(w.find('.clip-count').text()).toContain('Известно 2 из 2 слов')
    expect(w.find('.clip-count').text()).toContain('выучено 1')
    const btns = w.findAll('.clip-text .cw')
    expect(btns.map(b => b.text())).toEqual(['학교에', '가요'])
    expect(btns[0]!.classes()).toContain('new')
    expect(btns[1]!.classes()).toContain('learned')
    await btns[1]!.trigger('click')
    expect(w.find('.clip-card').text()).toContain('가다')
    expect(w.find('.clip-card').text()).toContain('выучено')
    await btns[1]!.trigger('click')
    expect(w.find('.clip-card').exists()).toBe(false)
    expect(calls).toEqual([])
    w.unmount()
  })

  it('слово только из большого словаря: другой цвет и перевод по krdict; ненайденное серым; «Очистить»', async () => {
    localStorage.clear()
    sessionStorage.clear()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const calls = stubDict({ 쓰레기통: 'мусорное ведро' })
    const w = await mountSuspended(ClipView, { route: '/korean/clip' })
    await w.find('textarea').setValue('학교 쓰레기통은 앗쿠')
    expect(w.find('.clip-count').text()).toContain('Известно 1 из 3 слов')
    vi.advanceTimersByTime(700)
    await flushPromises()
    await flushPromises()
    expect(calls).toContain('쓰레기통')
    const btns = w.findAll('.clip-text .cw')
    expect(btns[1]!.classes()).toContain('dict')
    expect(btns[2]!.classes()).toContain('none')
    expect(w.find('.clip-count').text()).toContain('ещё 1 в большом словаре')
    await btns[1]!.trigger('click')
    expect(w.find('.clip-card').text()).toContain('мусорное ведро')
    expect(w.find('.clip-link').attributes('href')).toContain('/dict/')
    await btns[2]!.trigger('click')
    expect(w.find('.clip-card').text()).toContain('не найдено')

    await w.findAll('button').find(b => b.text() === 'Очистить')!.trigger('click')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(w.find('.clip-count').exists()).toBe(false)
    expect(w.find('.clip-card').exists()).toBe(false)
    expect(sessionStorage.length + localStorage.length).toBe(0)
    w.unmount()
  })
})
