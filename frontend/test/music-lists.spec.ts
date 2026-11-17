import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MusicPlayer from '@/components/music/MusicPlayer.vue'
import { useMusicStore, type Playlist, type Track } from '@/stores/music'

// Окно плеера: очередь «играть следом», плейлисты, таймер сна, предупреждение о повторах при загрузке.
const who = vi.hoisted(() => ({ unlocked: true, owner: true }))
const ask = vi.hoisted(() => ({ answer: true, seen: [] as { title: string; text?: string; ok?: string }[] }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => who.unlocked, isGuest: () => !who.owner, bearer: () => 'token-123' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})
vi.mock('@/composables/useConfirm', () => ({
  askConfirm: async (o: { title: string; text?: string; ok?: string }) => {
    ask.seen.push(o)
    return ask.answer
  },
}))

class FakeAudio extends EventTarget {
  src = ''
  volume = 1
  muted = false
  currentTime = 0
  duration = NaN
  preload = ''
  paused = true
  play() {
    this.paused = false
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  removeAttribute() {
    this.src = ''
  }
}

const T = (n: number, category: Track['category'] = 'quiet'): Track => ({ id: String(n).repeat(16), title: `Песня ${n}`, duration: 100, size: n * 1000, created: n, source: 'upload', category, cover: null })
const TRACKS = [T(1), T(2), T(3)]
let playlists: Playlist[]
const calls: { url: string; method: string; body?: string }[] = []

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
  ask.answer = true
  ask.seen.length = 0
  playlists = [{ id: 'aaaaaaaaaaaaaaaa', name: 'Вечер', tracks: ['1'.repeat(16)], created: 1 }]
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body as string | undefined })
    if (url === '/api/music') return new Response(JSON.stringify({ tracks: TRACKS, jobs: [], playlists }))
    if (/\/url$/.test(url)) return new Response(JSON.stringify({ url: '/api/music/x/stream?e=9&s=y' }))
    if (url === '/api/music/playlists' && method === 'POST') {
      const b = JSON.parse(String(init!.body))
      const p = { id: 'bbbbbbbbbbbbbbbb', name: b.name, tracks: b.tracks, created: 2 }
      playlists = [...playlists, p]
      return new Response(JSON.stringify(p))
    }
    if (/\/api\/music\/playlists\/[a-f0-9]{16}$/.test(url) && method === 'PATCH') {
      const id = url.split('/').pop()!
      const b = JSON.parse(String(init!.body))
      playlists = playlists.map(p => (p.id === id ? { ...p, ...(b.tracks ? { tracks: b.tracks } : {}), ...(b.name ? { name: b.name } : {}) } : p))
      return new Response(JSON.stringify(playlists.find(p => p.id === id)))
    }
    if (/\/api\/music\/playlists\/[a-f0-9]{16}$/.test(url) && method === 'DELETE') {
      playlists = playlists.filter(p => !url.endsWith(p.id))
      return new Response('{"ok":true}')
    }
    if (url === '/api/music/upload') return new Response('{}', { status: 202 })
    return new Response('{}', { status: 404 })
  })
  const s = useMusicStore()
  s.currentId = ''
  s.ctx = ''
  s.upNext = []
  s.tab = 'quiet'
  s.uploads = []
})
afterEach(() => {
  useMusicStore().setSleep(0)
  vi.unstubAllGlobals()
})

async function open() {
  const w = await mountSuspended(MusicPlayer)
  await flushPromises()
  useMusicStore().open = true
  await flushPromises()
  return w
}
const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]
const byText = (sel: string, text: string) => $$(sel).find(e => e.textContent!.includes(text))!
const click = async (e: HTMLElement | null) => {
  e!.click()
  await flushPromises()
}
/** Отправка формы (нажатие на кнопку submit в тестовой среде форму не отправляет). */
const submit = async (form: HTMLElement | null) => {
  form!.dispatchEvent(new Event('submit', { cancelable: true }))
  await flushPromises()
}

describe('очередь в окне плеера', () => {
  it('«Играть следом» и «В очередь» из меню «⋮» показывают очередь, крестик убирает, «Очистить» стирает', async () => {
    const w = await open()
    const s = useMusicStore()
    await click($$('.mp-more .mp-ic')[0]!)
    await click(byText('.mp-menu button', 'Играть следом'))
    await click($$('.mp-more .mp-ic')[1]!)
    await click(byText('.mp-menu button', 'В очередь'))
    expect(s.upNext).toEqual(['1'.repeat(16), '2'.repeat(16)])
    expect($('.mp-queue summary')!.textContent).toContain('2')
    expect($$('.mp-queue li span').map(e => e.textContent)).toEqual(['Песня 1', 'Песня 2'])
    await click($('.mp-queue li button'))
    expect(s.upNext).toEqual(['2'.repeat(16)])
    await click($('.mp-queue .mp-link'))
    expect(s.upNext).toEqual([])
    expect($('.mp-queue')).toBeNull()
    w.unmount()
  })
})

describe('плейлисты в окне плеера', () => {
  it('вкладка «Плейлисты»: создать, песни видны, «Играть» запускает плейлист, удалить через подтверждение', async () => {
    const w = await open()
    const s = useMusicStore()
    expect($$('.mp-tabs button').map(b => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Тихая музыка 3', 'Nightcore 0', 'Плейлисты 1'])
    await click(byText('.mp-tabs button', 'Плейлисты'))
    expect($('.mp-lists')).not.toBeNull()
    expect($$('.mp-pl summary b').map(e => e.textContent)).toEqual(['Вечер'])
    const input = $('.mp-newlist input') as HTMLInputElement
    input.value = 'Утро'
    input.dispatchEvent(new Event('input'))
    await submit($('.mp-newlist'))
    expect(calls.some(c => c.url === '/api/music/playlists' && c.method === 'POST')).toBe(true)
    expect($$('.mp-pl summary b').map(e => e.textContent)).toEqual(['Вечер', 'Утро'])
    await click(byText('.mp-pl-act button', 'Играть'))
    expect(s.ctx).toBe('aaaaaaaaaaaaaaaa')
    expect(s.currentId).toBe('1'.repeat(16))
    await click(byText('.mp-pl-act button', 'Удалить'))
    expect(ask.seen.at(-1)!.title).toBe('Удалить плейлист?')
    expect($$('.mp-pl summary b').map(e => e.textContent)).toEqual(['Утро'])
    w.unmount()
  })

  it('«В плейлист…» в меню песни: добавить в существующий (повтор помечен) и создать новый с этой песней', async () => {
    const w = await open()
    await click($$('.mp-more .mp-ic')[1]!)
    await click(byText('.mp-menu button', 'В плейлист'))
    expect($$('.mp-menu button').map(b => b.textContent!.trim()).slice(0, 1)).toEqual(['Вечер'])
    await click(byText('.mp-menu button', 'Вечер'))
    expect(playlists[0]!.tracks).toEqual(['1'.repeat(16), '2'.repeat(16)])
    await click($$('.mp-more .mp-ic')[2]!)
    await click(byText('.mp-menu button', 'В плейлист'))
    const input = $('.mp-menu-new input') as HTMLInputElement
    input.value = 'Новый'
    input.dispatchEvent(new Event('input'))
    await submit($('.mp-menu-new'))
    expect(playlists.at(-1)!.name).toBe('Новый')
    expect(playlists.at(-1)!.tracks).toEqual(['3'.repeat(16)])
    w.unmount()
  })
})

describe('таймер сна в окне плеера', () => {
  it('кнопка показывает состояние: выкл, через N минут с отсчётом, после песни; «Выключить» сбрасывает', async () => {
    const w = await open()
    const s = useMusicStore()
    expect($('.mp-chip')!.textContent).toBe('Таймер сна')
    await click($('.mp-chip'))
    await click(byText('.mp-pop button', 'Через 15 мин'))
    expect($('.mp-chip')!.textContent).toMatch(/^Сон · \d+:\d{2}$/)
    expect(s.sleepEnd).toBeGreaterThan(0)
    await click($('.mp-chip'))
    await click(byText('.mp-pop button', 'После этой песни'))
    expect($('.mp-chip')!.textContent).toBe('Сон · после песни')
    await click($('.mp-chip'))
    await click(byText('.mp-pop button', 'Выключить'))
    expect($('.mp-chip')!.textContent).toBe('Таймер сна')
    expect(s.sleepEnd).toBe(0)
    expect(s.sleepTrack).toBe(false)
    w.unmount()
  })
})

describe('предупреждение о повторах при загрузке', () => {
  const input = () => $('input[type=file]') as HTMLInputElement
  const choose = async (files: File[]) => {
    Object.defineProperty(input(), 'files', { configurable: true, value: files })
    input().dispatchEvent(new Event('change'))
    await flushPromises()
    await new Promise(r => setTimeout(r, 50))
    await flushPromises()
  }

  it('есть повторы: окно называет их, «Только новые» грузит остальные', async () => {
    const w = await open()
    const dup = new File([new Uint8Array(1000)], 'другое имя.mp3', { type: 'audio/mpeg' }) // размер как у «Песня 1»
    const fresh = new File([new Uint8Array(777)], 'Новая.mp3', { type: 'audio/mpeg' })
    await choose([dup, fresh])
    expect(ask.seen).toHaveLength(1)
    expect(ask.seen[0]!.title).toBe('Такие песни уже есть')
    expect(ask.seen[0]!.text).toContain('«другое имя.mp3» (Песня 1)')
    expect(ask.seen[0]!.text).toContain('Загрузить только новые (1)?')
    expect(ask.seen[0]!.ok).toBe('Только новые')
    expect(calls.filter(c => c.url === '/api/music/upload')).toHaveLength(0) // загрузка идёт через XMLHttpRequest, не fetch
    w.unmount()
  })

  it('«Отмена»: ничего не загружается; повторов нет: окна нет', async () => {
    const w = await open()
    const s = useMusicStore()
    ask.answer = false
    await choose([new File([new Uint8Array(1000)], 'x.mp3')])
    expect(ask.seen).toHaveLength(1)
    expect(s.uploads).toHaveLength(0)
    ask.seen.length = 0
    await choose([new File([new Uint8Array(555)], 'y.mp3')])
    expect(ask.seen).toHaveLength(0)
    w.unmount()
  })

  it('все файлы повторы: окно говорит «Новых файлов нет», загружать нечего', async () => {
    const w = await open()
    await choose([new File([new Uint8Array(2000)], 'a.mp3'), new File([new Uint8Array(3000)], 'b.mp3')])
    expect(ask.seen[0]!.text).toContain('Новых файлов нет')
    expect(ask.seen[0]!.ok).toBe('Понятно')
    w.unmount()
  })
})
