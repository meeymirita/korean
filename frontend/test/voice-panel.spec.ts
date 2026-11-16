import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VoicePanel from '@/components/voice/VoicePanel.vue'
import VoiceButton from '@/components/voice/VoiceButton.vue'
import { lineFromEvent, mmss, useVoiceStore } from '@/stores/voice'

// Голосовой собеседник: кнопка только у владельца, остаток минут, начало и конец разговора, сохранение реплик, история.
const who = vi.hoisted(() => ({ unlocked: true, owner: true }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => who.unlocked, isGuest: () => !who.owner, bearer: () => 'токен сеанс' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

const STATUS = { configured: true, model: 'm', limitSec: 600, maxSessionSec: 600, usedSec: 120, leftSec: 480, costPerMin: 0.05, costToday: 0.1 }
const HISTORY = [{ id: 'aaaaaaaaaaaaaaaa', started: 1_700_000_000_000, seconds: 95, messages: 2, preview: '안녕하세요', live: false }]
const calls: { url: string; method: string; body?: string }[] = []
let channel: { onmessage?: (e: { data: string }) => void; onopen?: () => void; send: (s: string) => void; close: () => void }

class FakePC {
  connectionState = 'new'
  ontrack: unknown
  onconnectionstatechange: unknown
  addTrack() {}
  createDataChannel() {
    channel = { send: (s: string) => calls.push({ url: 'channel', method: 'SEND', body: s }), close() {} }
    return channel
  }
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'v=0 offer' })
  }
  setLocalDescription() {
    return Promise.resolve()
  }
  setRemoteDescription() {
    return Promise.resolve()
  }
  close() {}
}
class FakeAudio {
  srcObject: unknown = null
  autoplay = false
}

beforeEach(() => {
  const store = useVoiceStore()
  store.open = false
  store.tab = 'talk'
  store.opened = null
  calls.length = 0
  who.unlocked = true
  who.owner = true
  vi.stubGlobal('RTCPeerConnection', FakePC)
  vi.stubGlobal('Audio', FakeAudio)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }], getAudioTracks: () => [{ enabled: true }] }) } })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body as string | undefined })
    if (url === '/api/voice' && method === 'GET') return new Response(JSON.stringify(STATUS))
    if (url === '/api/voice/sessions' && method === 'POST') return new Response(JSON.stringify({ ...STATUS, id: 'bbbbbbbbbbbbbbbb', secret: 'ek_x', callsUrl: 'https://api.openai.com/v1/realtime/calls', maxSec: 480 }))
    if (url === '/api/voice/sessions' && method === 'GET') return new Response(JSON.stringify({ sessions: HISTORY }))
    if (url === 'https://api.openai.com/v1/realtime/calls') return new Response('v=0 answer')
    if (/\/messages$/.test(url)) return new Response('{"ok":true}')
    if (/\/review$/.test(url)) return url.includes('/bad') ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ review: '**Что получилось** — верно' }))
    if (/\/end$/.test(url)) return new Response(JSON.stringify({ ...STATUS, usedSec: 180, leftSec: 420 }))
    if (/^\/api\/voice\/sessions\/a+$/.test(url) && method === 'GET') return new Response(JSON.stringify({ id: 'aaaaaaaaaaaaaaaa', started: 1, seconds: 95, messages: [{ role: 'user', text: '안녕하세요' }, { role: 'assistant', text: '반가워요' }] }))
    if (/^\/api\/voice\/sessions\/a+$/.test(url) && method === 'DELETE') return new Response('{"ok":true}')
    return new Response('{}', { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('голос: чистые функции', () => {
  it('время и разбор событий Realtime', () => {
    expect(mmss(0)).toBe('0:00')
    expect(mmss(605)).toBe('10:05')
    expect(mmss(-4)).toBe('0:00')
    expect(lineFromEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: ' 안녕  하세요\n' })).toEqual({ role: 'user', text: '안녕 하세요' })
    expect(lineFromEvent({ type: 'response.output_audio_transcript.done', transcript: 'Привет' })).toEqual({ role: 'assistant', text: 'Привет' })
    expect(lineFromEvent({ type: 'response.output_audio_transcript.done', transcript: '  ' })).toBeNull()
    expect(lineFromEvent({ type: 'response.done' })).toBeNull()
    expect(lineFromEvent(null)).toBeNull()
  })
})

describe('голосовой собеседник', () => {
  it('без входа и у гостя кнопки нет и сервер не спрашивается', async () => {
    who.unlocked = false
    const a = await mountSuspended(VoiceButton)
    expect(a.find('button').exists()).toBe(false)
    await mountSuspended(VoicePanel)
    who.unlocked = true
    who.owner = false
    const b = await mountSuspended(VoiceButton)
    expect(b.find('button').exists()).toBe(false)
    await flushPromises()
    expect(calls.filter(c => c.url.startsWith('/api/voice'))).toHaveLength(0)
  })

  it('кнопка открывает окно, в нём остаток минут и примерная цена', async () => {
    const btn = await mountSuspended(VoiceButton)
    await mountSuspended(VoicePanel)
    await btn.find('button').trigger('click')
    await flushPromises()
    expect(useVoiceStore().open).toBe(true)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Осталось 8 мин из 10 мин')
    expect(text).toContain('≈ $0.10')
    expect(document.body.querySelector('.vp-rec')).not.toBeNull()
  })

  it('без ключа на сервере начать нельзя и окно объясняет почему', async () => {
    const store = useVoiceStore()
    await mountSuspended(VoicePanel)
    store.status = { ...STATUS, configured: false }
    store.open = true
    await flushPromises()
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ...STATUS, configured: false })))
    await store.load()
    await flushPromises()
    expect(document.body.querySelector('.vp-rec')?.hasAttribute('disabled')).toBe(true)
    expect(document.body.textContent).toContain('не подключён')
  })

  it('разговор: временный ключ идёт в OpenAI, реплики сохраняются на сервере, конец обновляет остаток', async () => {
    const store = useVoiceStore()
    store.ptt = false
    await store.load()
    await store.start()
    expect(store.phase).toBe('live')
    const offerCall = calls.find(c => c.url === 'https://api.openai.com/v1/realtime/calls')!
    expect(offerCall.method).toBe('POST')
    expect(offerCall.body).toBe('v=0 offer')
    channel.onopen?.()
    expect(calls.some(c => c.url === 'channel' && c.body?.includes('response.create'))).toBe(true)
    channel.onmessage?.({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: '안녕하세요' }) })
    channel.onmessage?.({ data: JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: '반가워요' }) })
    channel.onmessage?.({ data: 'не json' })
    expect(store.lines.map(l => l.role)).toEqual(['user', 'assistant'])
    await flushPromises()
    const saved = calls.filter(c => /\/messages$/.test(c.url))
    expect(saved).toHaveLength(2)
    expect(JSON.parse(saved[0]!.body!)).toEqual({ role: 'user', text: '안녕하세요' })
    store.toggleMute()
    expect(store.muted).toBe(true)
    await store.stop()
    expect(store.phase).toBe('idle')
    expect(calls.some(c => /\/end$/.test(c.url))).toBe(true)
    expect(store.status?.leftSec).toBe(420)
  })

  it('удерживай и говори: запись уходит по отпусканию, короткое нажатие и текстовый ответ работают, исправление убирает услышанное', async () => {
    const store = useVoiceStore()
    store.ptt = true
    store.scene = 'intro'
    await store.load()
    await store.start()
    const start = calls.find(c => c.url === '/api/voice/sessions' && c.method === 'POST')!
    expect(JSON.parse(start.body!)).toEqual({ scene: 'intro', ptt: true })
    const sent = () => calls.filter(c => c.url === 'channel').map(c => JSON.parse(c.body!).type as string)
    calls.length = 0
    store.holdStart()
    expect(store.talking).toBe(true)
    store.holdEnd() // короче 0,4 с: отбрасывается
    expect(sent()).not.toContain('input_audio_buffer.commit')
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    store.holdStart()
    vi.advanceTimersByTime(1000)
    store.holdEnd()
    vi.useRealTimers()
    expect(sent()).toEqual(expect.arrayContaining(['input_audio_buffer.commit', 'response.create']))
    calls.length = 0
    channel.onmessage?.({ data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: '컨퓨해요', item_id: 'item_1' }) })
    store.fixLine(0, '공부해요')
    expect(store.lines[0]!.wrong).toBe(true)
    expect(sent()).toEqual(expect.arrayContaining(['conversation.item.delete', 'conversation.item.create', 'response.create']))
    expect(store.lines.at(-1)).toMatchObject({ role: 'user', text: '공부해요' })
    await store.stop()
  })

  it('разбор разговора: отчёт приходит с сервера и сохраняется в окне', async () => {
    const store = useVoiceStore()
    await store.runReview('aaaaaaaaaaaaaaaa')
    expect(store.reviews['aaaaaaaaaaaaaaaa']).toContain('Что получилось')
    const call = calls.find(c => /\/review$/.test(c.url))!
    expect(JSON.parse(call.body!)).toEqual({ force: false })
    await store.runReview('bad')
    expect(store.reviews['bad']).toBeUndefined()
    expect(store.reviewing).toBe('')
  })

  it('мини-плашка видна, пока разговор идёт, а окно закрыто', async () => {
    const store = useVoiceStore()
    const w = await mountSuspended(VoicePanel)
    await store.load()
    await store.start()
    store.open = false
    await flushPromises()
    expect(w.find('.vp-mini').exists()).toBe(true)
    await store.stop()
    await flushPromises()
    expect(w.find('.vp-mini').exists()).toBe(false)
  })

  it('история: список, текст разговора, удаление', async () => {
    const store = useVoiceStore()
    await store.loadHistory()
    expect(store.history).toHaveLength(1)
    await store.openItem('aaaaaaaaaaaaaaaa')
    expect(store.opened?.lines.map(l => l.text)).toEqual(['안녕하세요', '반가워요'])
    await store.removeItem('aaaaaaaaaaaaaaaa')
    expect(store.history).toHaveLength(0)
    expect(store.opened).toBeNull()
  })
})
