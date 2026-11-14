import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MusicPlayer from '@/components/music/MusicPlayer.vue'
import { MAX_TRACK_MB, useMusicStore } from '@/stores/music'
import { coverFor, formatTime } from '@/components/music/playerAssets'

// Музыкальный плеер: кнопка только у владельца, список, воспроизведение через подписанную ссылку, добавление по ссылке.
/** вход подменён: настоящий без сервера невозможен */
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

/** Звук подменён: в тестовой среде настоящего воспроизведения нет. */
class FakeAudio extends EventTarget {
  src = ''
  volume = 1
  muted = false
  currentTime = 0
  duration = NaN
  preload = ''
  play() {
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }
  pause() {
    this.dispatchEvent(new Event('pause'))
  }
  removeAttribute() {
    this.src = ''
  }
}

const TRACKS = [
  { id: 'aaaaaaaaaaaaaaaa', title: 'Первая песня', duration: 83, size: 1000, created: 1, source: 'upload', cover: null },
  { id: 'bbbbbbbbbbbbbbbb', title: 'Вторая песня', duration: 3725, size: 2000, created: 2, source: 'url', cover: '/api/music/bbbbbbbbbbbbbbbb/cover?e=9&s=x' },
]
const calls: { url: string; method: string; body?: string }[] = []
let urlReply: () => Response

beforeEach(() => {
  // хранилище общее на все тесты файла: возвращаем в исходный вид
  const store = useMusicStore()
  store.open = false
  store.currentId = ''
  store.playing = false
  store.repeat = 'all'
  store.shuffle = false
  localStorage.clear()
  calls.length = 0
  who.unlocked = true
  who.owner = true
  urlReply = () => new Response('{}', { status: 202 })
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined })
    if (url === '/api/music' && !init?.method) return new Response(JSON.stringify({ tracks: TRACKS, jobs: [] }))
    if (/\/url$/.test(url) && !init?.method) return new Response(JSON.stringify({ url: '/api/music/x/stream?e=9&s=y' }))
    if (url === '/api/music/url') return urlReply()
    return new Response('{}', { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('форматирование', () => {
  it('время в минутах и часах, обложка по id одна и та же', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(83)).toBe('1:23')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(NaN)).toBe('0:00')
    expect(coverFor('aaaaaaaaaaaaaaaa')).toBe(coverFor('aaaaaaaaaaaaaaaa'))
  })
})

describe('музыкальный плеер', () => {
  it('без входа и у гостя кнопки нет и список не запрашивается', async () => {
    who.unlocked = false
    const a = await mountSuspended(MusicPlayer)
    expect(a.find('.mp-fab').exists()).toBe(false)
    a.unmount()
    who.unlocked = true
    who.owner = false
    const b = await mountSuspended(MusicPlayer)
    expect(b.find('.mp-fab').exists()).toBe(false)
    b.unmount()
    expect(calls.filter(c => c.url === '/api/music')).toHaveLength(0)
  })

  it('у владельца: кнопка открывает меню со списком, песни с длительностью', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    expect(w.find('.mp-fab').exists()).toBe(true)
    expect(document.querySelector('.mp-panel')).toBeNull()
    await w.find('.mp-fab').trigger('click')
    const rows = [...document.querySelectorAll('.mp-list li')]
    expect(rows.map(r => r.querySelector('b')?.textContent)).toEqual(['Первая песня', 'Вторая песня'])
    expect(rows.map(r => r.querySelector('small')?.textContent)).toEqual(['1:23', '1:02:05'])
    const covers = rows.map(r => r.querySelector<HTMLImageElement>('.mp-play > img')!.getAttribute('src'))
    expect(covers[1]).toContain('/api/music/bbbbbbbbbbbbbbbb/cover')
    expect(covers[0], 'своя обложка не пришла: берётся из набора').toBeTruthy()
    w.unmount()
  })

  it('«играть» берёт подписанную ссылку, запускает звук; повторное нажатие ставит на паузу', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    await w.find('.mp-fab').trigger('click')
    document.querySelectorAll<HTMLButtonElement>('.mp-list li .mp-play')[0]!.click()
    await flushPromises()
    expect(calls.some(c => c.url === '/api/music/aaaaaaaaaaaaaaaa/url')).toBe(true)
    expect(store.currentId).toBe('aaaaaaaaaaaaaaaa')
    expect(store.playing).toBe(true)
    expect(w.find('.mp-fab').classes()).toContain('on')
    document.querySelectorAll<HTMLButtonElement>('.mp-list li .mp-play')[0]!.click()
    await flushPromises()
    expect(store.playing).toBe(false)
    expect(JSON.parse(localStorage.getItem('music_v1')!).id, 'песня запоминается').toBe('aaaaaaaaaaaaaaaa')
    w.unmount()
  })

  it('следующая и предыдущая, повтор одной и без повтора', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    await store.play('aaaaaaaaaaaaaaaa')
    await store.advance(true)
    expect(store.currentId).toBe('bbbbbbbbbbbbbbbb')
    await store.advance(true)
    expect(store.currentId, 'после последней идёт первая').toBe('aaaaaaaaaaaaaaaa')
    await store.prev()
    expect(store.currentId, 'назад от первой: последняя').toBe('bbbbbbbbbbbbbbbb')
    store.repeat = 'off'
    await store.advance(false)
    expect(store.playing, 'без повтора после последней песни звук останавливается').toBe(false)
    w.unmount()
  })

  it('файл больше лимита отклоняется сразу, без передачи на сервер', async () => {
    const store = useMusicStore()
    store.uploads = []
    const big = new File([''], 'Сборник.mp3')
    Object.defineProperty(big, 'size', { value: (MAX_TRACK_MB + 1) * 1024 * 1024 })
    await store.uploadFiles([big])
    expect(store.uploads).toHaveLength(1)
    expect(store.uploads[0]!.error).toContain(`больше лимита ${MAX_TRACK_MB} МБ`)
    expect(MAX_TRACK_MB, 'сборники владельца весят до 330 МБ').toBeGreaterThanOrEqual(330)
    store.uploads = []
  })

  it('добавить по ссылке: запрос уходит с адресом; «уже идёт скачивание» показывается под полем', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    await w.find('.mp-fab').trigger('click')
    const input = document.querySelector<HTMLInputElement>('.mp-url input')!
    input.value = 'https://youtu.be/abc'
    input.dispatchEvent(new Event('input'))
    document.querySelector<HTMLFormElement>('.mp-url')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    const post = calls.find(c => c.url === '/api/music/url' && c.method === 'POST')!
    expect(JSON.parse(post.body!)).toEqual({ url: 'https://youtu.be/abc' })
    expect(input.value, 'после успеха поле очищается').toBe('')

    urlReply = () => new Response('{}', { status: 409 })
    input.value = 'https://youtu.be/def'
    input.dispatchEvent(new Event('input'))
    document.querySelector<HTMLFormElement>('.mp-url')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    expect(document.querySelector('.mp-err')?.textContent).toContain('Уже идёт скачивание')
    w.unmount()
  })
})
