import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MusicPlayer from '@/components/music/MusicPlayer.vue'
import MusicButton from '@/components/music/MusicButton.vue'
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
  { id: 'aaaaaaaaaaaaaaaa', title: 'Первая песня', duration: 83, size: 1000, created: 1, source: 'upload', category: 'quiet', cover: null },
  { id: 'bbbbbbbbbbbbbbbb', title: 'Вторая песня', duration: 3725, size: 2000, created: 2, source: 'url', category: 'quiet', cover: '/api/music/bbbbbbbbbbbbbbbb/cover?e=9&s=x' },
  { id: 'cccccccccccccccc', title: 'Ночная песня', duration: 120, size: 3000, created: 3, source: 'upload', category: 'nightcore', cover: null },
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
  store.tab = 'quiet'
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
    if (/^\/api\/music\/[a-f0-9]{16}$/.test(url) && init?.method === 'PATCH') return new Response('{}')
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
    expect(a.find('.mp-root').exists()).toBe(false)
    a.unmount()
    who.unlocked = true
    who.owner = false
    const b = await mountSuspended(MusicPlayer)
    expect(b.find('.mp-root').exists()).toBe(false)
    b.unmount()
    expect(calls.filter(c => c.url === '/api/music')).toHaveLength(0)
  })

  it('кнопка открытия: только у владельца, открывает и закрывает меню, при игре подсвечена', async () => {
    who.unlocked = false
    const none = await mountSuspended(MusicButton)
    expect(none.find('.mp-fab').exists()).toBe(false)
    none.unmount()
    who.unlocked = true
    const w = await mountSuspended(MusicButton, { props: { variant: 'fixed' } })
    const store = useMusicStore()
    expect(w.find('.mp-fab').classes()).toContain('mp-fab-fixed')
    expect(w.find('.mp-fab').attributes('aria-expanded')).toBe('false')
    await w.find('.mp-fab').trigger('click')
    expect(store.open).toBe(true)
    expect(w.find('.mp-fab').attributes('aria-expanded')).toBe('true')
    await w.find('.mp-fab').trigger('click')
    expect(store.open).toBe(false)
    await store.load()
    await store.play('aaaaaaaaaaaaaaaa')
    await flushPromises()
    expect(w.find('.mp-fab').classes()).toContain('on')
    store.stop()
    w.unmount()
  })

  it('мини-плеер: полоса времени перематывает, «закрыть» останавливает музыку и убирает плеер', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    await store.play('bbbbbbbbbbbbbbbb')
    await flushPromises()
    const mini = w.find('.mp-mini').element // мини-плеер не в Teleport: ищем в самом компоненте
    expect(mini).not.toBeNull()
    // у FakeAudio нет длительности: берётся длительность песни из списка
    store.length = 3725
    const seek = mini.querySelector<HTMLInputElement>('.mp-mini-seek')!
    seek.value = '50'
    seek.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(Math.round(store.time), 'перемотка на середину песни').toBe(1863)
    const close = mini.querySelector<HTMLButtonElement>('button[aria-label^="Закрыть плеер"]')!
    close.click()
    await flushPromises()
    expect(store.playing).toBe(false)
    expect(store.currentId).toBe('')
    expect(w.find('.mp-mini').exists(), 'мини-плеер исчез').toBe(false)
    w.unmount()
  })

  it('в очереди одна песня (длинный сборник): «дальше» начинает её заново, а не молчит', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    store.tab = 'nightcore' // во вкладке Nightcore одна песня
    await store.play('cccccccccccccccc')
    store.time = 500
    await store.advance(true)
    expect(store.currentId).toBe('cccccccccccccccc')
    expect(store.time, 'началась сначала').toBe(0)
    expect(store.playing).toBe(true)
    store.stop()
    w.unmount()
  })

  it('у владельца: кнопка открывает меню со списком, песни с длительностью', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    expect(w.find('.mp-root').exists()).toBe(true)
    expect(document.querySelector('.mp-panel')).toBeNull()
    useMusicStore().open = true
    await flushPromises()
    const rows = [...document.querySelectorAll('.mp-list li')]
    expect(rows.map(r => r.querySelector('b')?.textContent)).toEqual(['Первая песня', 'Вторая песня'])
    expect(rows.map(r => r.querySelector('small')?.textContent)).toEqual(['1:23', '1:02:05'])
    const covers = rows.map(r => r.querySelector<HTMLImageElement>('.mp-play > img')!.getAttribute('src'))
    expect(covers[1]).toContain('/api/music/bbbbbbbbbbbbbbbb/cover')
    expect(covers[0], 'своя обложка не пришла: берётся из набора').toBeTruthy()
    w.unmount()
  })

  it('вкладки: «Тихая музыка» и Nightcore показывают свои песни, очередь идёт по вкладке играющей песни', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    useMusicStore().open = true
    await flushPromises()
    const tabs = [...document.querySelectorAll('.mp-tabs button')]
    expect(tabs.map(t => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Тихая музыка 2', 'Nightcore 1', 'Плейлисты 0'])
    expect(document.querySelectorAll('.mp-list li')).toHaveLength(2)

    ;(tabs[1] as HTMLButtonElement).click()
    await flushPromises()
    expect(store.tab).toBe('nightcore')
    expect([...document.querySelectorAll('.mp-list li b')].map(b => b.textContent)).toEqual(['Ночная песня'])
    expect(JSON.parse(localStorage.getItem('music_v1')!).tab, 'вкладка запоминается').toBe('nightcore')

    // играет песня тихой вкладки, пользователь ушёл смотреть Nightcore: «дальше» остаётся в тихой вкладке
    await store.play('aaaaaaaaaaaaaaaa')
    await store.advance(true)
    expect(store.currentId).toBe('bbbbbbbbbbbbbbbb')
    expect(store.tab).toBe('nightcore')
    w.unmount()
  })

  it('поиск рядом с вкладками ищет по названию во всех вкладках сразу и очищается крестиком', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    store.open = true
    await flushPromises()
    const input = () => document.querySelector('.mp-search input') as HTMLInputElement
    const titles = () => [...document.querySelectorAll('.mp-list li b')].map(b => b.textContent)
    expect(titles()).toEqual(['Первая песня', 'Вторая песня'])
    input().value = 'ночн'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    // открыта «Тихая музыка», а найденная песня лежит в Nightcore: она всё равно находится, с подписью вкладки
    expect(titles()).toEqual(['Ночная песня'])
    expect(document.querySelector('.mp-list li small')!.textContent).toContain('Nightcore')
    input().value = 'ВТОРАЯ'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    expect(titles()).toEqual(['Вторая песня'])
    input().value = 'нет такой'
    input().dispatchEvent(new Event('input'))
    await flushPromises()
    expect(document.querySelector('.mp-empty')!.textContent).toContain('Ничего не нашлось')
    ;(document.querySelector('.mp-search-x') as HTMLButtonElement).click()
    await flushPromises()
    expect(titles()).toEqual(['Первая песня', 'Вторая песня'])
    expect(store.tab, 'поиск вкладку не переключает').toBe('quiet')
    w.unmount()
  })

  it('песню можно перенести в другую вкладку из меню «⋮»', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    useMusicStore().open = true
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.mp-list li .mp-more .mp-ic')!.click()
    await flushPromises()
    const move = [...document.querySelectorAll<HTMLButtonElement>('.mp-menu button')].find(b => b.textContent!.includes('Nightcore'))!
    move.click()
    await flushPromises()
    const patch = calls.find(c => c.method === 'PATCH')!
    expect(patch.url).toBe('/api/music/aaaaaaaaaaaaaaaa')
    expect(JSON.parse(patch.body!)).toEqual({ category: 'nightcore' })
    expect(store.tracks.find(t => t.id === 'aaaaaaaaaaaaaaaa')!.category).toBe('nightcore')
    w.unmount()
  })

  it('«играть» берёт подписанную ссылку, запускает звук; повторное нажатие ставит на паузу', async () => {
    const w = await mountSuspended(MusicPlayer)
    await flushPromises()
    const store = useMusicStore()
    useMusicStore().open = true
    await flushPromises()
    document.querySelectorAll<HTMLButtonElement>('.mp-list li .mp-play')[0]!.click()
    await flushPromises()
    expect(calls.some(c => c.url === '/api/music/aaaaaaaaaaaaaaaa/url')).toBe(true)
    expect(store.currentId).toBe('aaaaaaaaaaaaaaaa')
    expect(store.playing).toBe(true)
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
    useMusicStore().open = true
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('.mp-url input')!
    input.value = 'https://youtu.be/abc'
    input.dispatchEvent(new Event('input'))
    document.querySelector<HTMLFormElement>('.mp-url')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    const post = calls.find(c => c.url === '/api/music/url' && c.method === 'POST')!
    expect(JSON.parse(post.body!)).toEqual({ url: 'https://youtu.be/abc', category: 'quiet' })
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

/** Подставной XMLHttpRequest: статусы ответов по очереди (429 с просьбой подождать секунду, потом 202). */
class FakeXHR {
  static plan: number[] = []
  static sent = 0
  upload: { onprogress?: unknown } = {}
  status = 0
  onload?: () => void
  onerror?: () => void
  ontimeout?: () => void
  open() {}
  setRequestHeader() {}
  getResponseHeader(name: string) {
    return name === 'Retry-After' ? '1' : null
  }
  send() {
    this.status = FakeXHR.plan.shift() ?? 202
    FakeXHR.sent++
    queueMicrotask(() => this.onload?.())
  }
}

describe('загрузка файлов: лимит запросов (429)', () => {
  const file = () => new File(['x'], 'песня.mp3', { type: 'audio/mpeg' })
  beforeEach(() => {
    FakeXHR.plan = []
    FakeXHR.sent = 0
    useMusicStore().uploads = []
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
  })
  afterEach(() => vi.useRealTimers())

  it('на 429 ждёт, сколько просит сервер, и повторяет сам', async () => {
    FakeXHR.plan = [429, 202]
    const store = useMusicStore()
    const done = store.uploadFiles([file()])
    await vi.advanceTimersByTimeAsync(10)
    expect(store.uploads[0]!.wait, 'видно, сколько секунд ждать').toBe(1)
    await vi.advanceTimersByTimeAsync(1500)
    await done
    expect(FakeXHR.sent).toBe(2)
    expect(store.uploads, 'после успеха строка уходит').toHaveLength(0)
  })

  it('после четырёх 429 остаётся ошибка, «Повторить» отправляет файл ещё раз', async () => {
    FakeXHR.plan = [429, 429, 429, 429, 202]
    const store = useMusicStore()
    const done = store.uploadFiles([file()])
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(FakeXHR.sent).toBe(4)
    expect(store.uploads).toHaveLength(1)
    expect(store.uploads[0]!.error).toContain('Повторить')
    await store.retryUpload(store.uploads[0]!.key)
    expect(FakeXHR.sent).toBe(5)
    expect(store.uploads).toHaveLength(0)
  })

  it('«Повторить все» берёт каждую упавшую загрузку по очереди', async () => {
    FakeXHR.plan = [500, 500, 202, 202]
    const store = useMusicStore()
    const done = store.uploadFiles([file(), file()])
    await vi.advanceTimersByTimeAsync(3000)
    await done
    expect(store.uploads.filter(u => u.error)).toHaveLength(2)
    const again = store.retryFailed()
    await vi.advanceTimersByTimeAsync(3000)
    await again
    expect(FakeXHR.sent).toBe(4)
    expect(store.uploads).toHaveLength(0)
  })
})
