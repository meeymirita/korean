import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChatView from '@/views/korean/ChatView.vue'

// Помощник-чат: вся история хранится на сервере, есть «Новый чат» и список прежних чатов.
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => true, isGuest: () => false, bearer: () => 'токен' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})
vi.mock('@/composables/useConfirm', () => ({ askConfirm: async () => true }))

const ID_A = 'aaaaaaaaaaaaaaaa'
const ID_NEW = 'bbbbbbbbbbbbbbbb'
let chats: { id: string; title: string; started: number; updated: number; messages: number }[]
const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []

beforeEach(() => {
  sessionStorage.clear()
  calls.length = 0
  chats = [{ id: ID_A, title: 'Как сказать «хлеб»?', started: 1_700_000_000_000, updated: 1_700_000_100_000, messages: 2 }]
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/chat' && method === 'GET') return new Response(JSON.stringify({ configured: true, model: 'm', limit: 40, left: 40 }))
    if (url === '/api/chat' && method === 'POST') return new Response(JSON.stringify({ reply: '빵 — хлеб', left: 39, conv: ID_NEW }))
    if (url === '/api/chat/conversations' && method === 'GET') return new Response(JSON.stringify({ conversations: chats }))
    if (url === `/api/chat/conversations/${ID_A}` && method === 'GET') return new Response(JSON.stringify({ id: ID_A, messages: [{ role: 'user', text: 'Как сказать «хлеб»?' }, { role: 'assistant', text: '빵 — хлеб' }] }))
    if (url === `/api/chat/conversations/${ID_A}` && method === 'DELETE') {
      chats = []
      return new Response('{"ok":true}')
    }
    return new Response('{}', { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())

const btn = (w: Awaited<ReturnType<typeof mountSuspended>>, text: string) => w.findAll('button').find(b => b.text().includes(text))!

describe('помощник-чат: история', () => {
  it('список чатов открывается кнопкой, нажатие на чат загружает его сообщения', async () => {
    const w = await mountSuspended(ChatView)
    await flushPromises()
    expect(btn(w, 'История чатов').text()).toContain('1')
    await btn(w, 'История чатов').trigger('click')
    expect(w.text()).toContain('Как сказать «хлеб»?')
    await w.find('.chat-hist-open').trigger('click')
    await flushPromises()
    const shown = w.findAll('.chat-msg').map(m => m.text())
    expect(shown).toHaveLength(2)
    expect(shown[0]).toBe('Как сказать «хлеб»?')
    expect(shown[1]).toContain('빵')
    expect(shown[1]).toContain('хлеб')
    expect(w.find('.chat-hist').exists()).toBe(false)
  })

  it('первый вопрос заводит чат (conv=new), следующий дописывается в него', async () => {
    const w = await mountSuspended(ChatView)
    await flushPromises()
    await w.find('textarea').setValue('Как сказать «хлеб»?')
    await w.find('form').trigger('submit')
    await flushPromises()
    const asks = calls.filter(c => c.url === '/api/chat' && c.method === 'POST')
    expect(asks[0]!.body!.conv).toBe('new')
    await w.find('textarea').setValue('А вода?')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls.filter(c => c.url === '/api/chat' && c.method === 'POST')[1]!.body!.conv).toBe(ID_NEW)
  })

  it('«Новый чат» закрывает текущий: сообщения пропадают, следующий вопрос снова заводит чат', async () => {
    const w = await mountSuspended(ChatView)
    await flushPromises()
    expect(btn(w, 'Новый чат').attributes('disabled')).toBeDefined()
    await w.find('textarea').setValue('вопрос')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.findAll('.chat-msg').length).toBe(2)
    await btn(w, 'Новый чат').trigger('click')
    expect(w.findAll('.chat-msg').length).toBe(0)
    await w.find('textarea').setValue('другой вопрос')
    await w.find('form').trigger('submit')
    await flushPromises()
    const asks = calls.filter(c => c.url === '/api/chat' && c.method === 'POST')
    expect(asks[1]!.body!.conv).toBe('new')
    expect(asks[1]!.body!.messages).toEqual([{ role: 'user', text: 'другой вопрос' }])
  })

  it('удаление чата убирает его из списка', async () => {
    const w = await mountSuspended(ChatView)
    await flushPromises()
    await btn(w, 'История чатов').trigger('click')
    await w.find('.chat-hist-del').trigger('click')
    await flushPromises()
    expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith(ID_A))).toBe(true)
    expect(w.findAll('.chat-hist-row').length).toBe(0)
  })

  it('после обновления страницы открывается тот же чат', async () => {
    sessionStorage.setItem('ui_chat_conv', JSON.stringify(ID_A))
    const w = await mountSuspended(ChatView)
    await flushPromises()
    expect(w.findAll('.chat-msg').length).toBe(2)
  })
})
