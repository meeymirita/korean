import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import TalksView from '@/views/korean/TalksView.vue'
import { highlight } from '@/lib/talks'
import { useVoiceStore } from '@/stores/voice'

// Общая история: чаты и голосовые разговоры в одном списке, поиск по тексту, открытие чата и голосового разговора.
const nav = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => nav)
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => true, isGuest: () => false, bearer: () => 'токен' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

const ALL = [
  { kind: 'chat', id: 'aaaaaaaaaaaaaaaa', title: 'Как сказать «хлеб»?', when: 1_700_000_100_000, messages: 2 },
  { kind: 'voice', id: 'bbbbbbbbbbbbbbbb', title: 'Расскажи про будущее время', when: 1_700_000_000_000, messages: 4 },
]
const FOUND = [{ kind: 'chat', id: 'aaaaaaaaaaaaaaaa', title: 'Как сказать «хлеб»?', when: 1_700_000_100_000, messages: 2, snippet: '…ответ про хлеб и воду…', matches: 3 }]
const calls: string[] = []

beforeEach(() => {
  calls.length = 0
  nav.mockClear()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url === '/api/talks') return new Response(JSON.stringify({ q: '', talks: ALL }))
    if (url.startsWith('/api/talks?q=')) return new Response(JSON.stringify({ q: 'хлеб', talks: FOUND }))
    if (url === '/api/voice/sessions/bbbbbbbbbbbbbbbb') return new Response(JSON.stringify({ id: 'bbbbbbbbbbbbbbbb', started: 1, seconds: 5, messages: [{ role: 'user', text: 'привет' }] }))
    return new Response('{}', { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('подсветка найденного', () => {
  it('режет текст на куски, найденное отдельно, регистр не важен', () => {
    expect(highlight('Про Хлеб и хлеб', 'хлеб')).toEqual([
      { text: 'Про ', hit: false },
      { text: 'Хлеб', hit: true },
      { text: ' и ', hit: false },
      { text: 'хлеб', hit: true },
    ])
    expect(highlight('без совпадений', 'хлеб')).toEqual([{ text: 'без совпадений', hit: false }])
    expect(highlight('текст', 'т')).toEqual([{ text: 'текст', hit: false }])
  })
})

describe('страница «Разговоры»', () => {
  it('показывает чаты и голосовые разговоры одним списком', async () => {
    const w = await mountSuspended(TalksView)
    await flushPromises()
    const items = w.findAll('.tk-item')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toContain('Чат')
    expect(items[0]!.text()).toContain('Как сказать')
    expect(items[1]!.text()).toContain('Голос')
  })

  it('поиск идёт на сервер после паузы и показывает найденное с выделением', async () => {
    const w = await mountSuspended(TalksView)
    await flushPromises()
    await w.find('input').setValue('хлеб')
    await new Promise(r => setTimeout(r, 450))
    await flushPromises()
    expect(calls.some(c => c.startsWith('/api/talks?q='))).toBe(true)
    expect(w.findAll('.tk-item')).toHaveLength(1)
    expect(w.find('mark').text()).toBe('хлеб')
    expect(w.text()).toContain('совпадений: 3')
  })

  it('нажатие на чат открывает его на странице помощника', async () => {
    const w = await mountSuspended(TalksView)
    await flushPromises()
    await w.findAll('.tk-item')[0]!.trigger('click')
    expect(nav).toHaveBeenCalledWith('/korean/chat?c=aaaaaaaaaaaaaaaa')
  })

  it('нажатие на голосовой разговор открывает окно голоса на вкладке «История»', async () => {
    const voice = useVoiceStore()
    voice.open = false
    const w = await mountSuspended(TalksView)
    await flushPromises()
    await w.findAll('.tk-item')[1]!.trigger('click')
    await flushPromises()
    expect(voice.open).toBe(true)
    expect(voice.tab).toBe('history')
    expect(calls).toContain('/api/voice/sessions/bbbbbbbbbbbbbbbb')
  })
})
