import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMusicStore, type Playlist, type Track } from '@/stores/music'

// Плеер: очередь «играть следом», плейлисты, таймер сна, поиск повторов при загрузке.
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
const instances: FakeAudio[] = []
/** Подставной звук, который запоминает созданные экземпляры (хранилище создаёт его один раз). */
class TrackedAudio extends FakeAudio {
  constructor() {
    super()
    instances.push(this)
  }
}
const audio = new Proxy({} as FakeAudio, {
  get: (_, k) => {
    const v = Reflect.get(instances.at(-1)!, k)
    return typeof v === 'function' ? v.bind(instances.at(-1)) : v
  },
  set: (_, k, v) => Reflect.set(instances.at(-1)!, k, v),
})

const T = (n: number, category: Track['category'] = 'quiet', size = n * 1000): Track => ({ id: String(n).repeat(16), title: `Песня ${n}`, duration: 100, size, created: n, source: 'upload', category, cover: null })
const TRACKS = [T(1), T(2), T(3), T(4, 'nightcore')]
const ID = (n: number) => String(n).repeat(16)
let playlists: Playlist[]
const calls: { url: string; method: string; body?: string }[] = []

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
  playlists = [{ id: 'aaaaaaaaaaaaaaaa', name: 'Вечер', tracks: [ID(3), ID(1)], created: 1 }]
  vi.stubGlobal('Audio', TrackedAudio)
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body as string | undefined })
    if (url === '/api/music') return new Response(JSON.stringify({ tracks: TRACKS, jobs: [], playlists }))
    if (/\/url$/.test(url)) return new Response(JSON.stringify({ url: '/api/music/x/stream?e=9&s=y' }))
    if (url === '/api/music/playlists' && method === 'POST') {
      const b = JSON.parse(String(init!.body))
      const p = { id: 'bbbbbbbbbbbbbbbb', name: b.name, tracks: b.tracks, created: 2 }
      return new Response(JSON.stringify(p))
    }
    if (/\/api\/music\/playlists\/[a-f0-9]{16}$/.test(url) && method === 'PATCH') {
      const id = url.split('/').pop()!
      const b = JSON.parse(String(init!.body))
      const old = playlists.find(p => p.id === id)!
      const next = { ...old, ...(b.name !== undefined ? { name: b.name } : {}), ...(b.tracks !== undefined ? { tracks: b.tracks } : {}) }
      playlists = playlists.map(p => (p.id === id ? next : p))
      return new Response(JSON.stringify(next))
    }
    if (/\/api\/music\/playlists\/[a-f0-9]{16}$/.test(url) && method === 'DELETE') return new Response('{"ok":true}')
    return new Response('{}', { status: 404 })
  })
  const s = useMusicStore()
  s.currentId = ''
  s.ctx = ''
  s.upNext = []
  s.playing = false
  s.shuffle = false
  s.repeat = 'all'
  s.tab = 'quiet'
})
afterEach(() => {
  useMusicStore().setSleep(0)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function loaded() {
  const s = useMusicStore()
  await s.load()
  return s
}

describe('очередь «играть следом»', () => {
  it('песни из очереди играют раньше обычного порядка, по одной, потом порядок вкладки', async () => {
    const s = await loaded()
    await s.play(ID(1))
    s.enqueue(ID(3))
    s.playNext(ID(2))
    expect(s.upNext).toEqual([ID(2), ID(3)])
    await s.advance(true)
    expect(s.currentId).toBe(ID(2))
    await s.advance(true)
    expect(s.currentId).toBe(ID(3))
    expect(s.upNext).toEqual([])
    await s.advance(true) // очередь кончилась: обычный порядок вкладки (после 3 снова 1)
    expect(s.currentId).toBe(ID(1))
  })

  it('убрать одну песню и очистить всю очередь; удалённая из списка песня из очереди уходит', async () => {
    const s = await loaded()
    s.enqueue(ID(1))
    s.enqueue(ID(2))
    s.enqueue(ID(3))
    s.unqueue(1)
    expect(s.upNext).toEqual([ID(1), ID(3)])
    s.clearQueue()
    expect(s.upNext).toEqual([])
    s.enqueue(ID(2))
    await s.remove(ID(2))
    expect(s.upNext).toEqual([])
  })

  it('очередь запоминается в браузере', async () => {
    const s = await loaded()
    s.enqueue(ID(2))
    expect(JSON.parse(localStorage.getItem('music_v1')!).upNext).toEqual([ID(2)])
  })
})

describe('плейлисты', () => {
  it('играть плейлист: дальше и назад идут по нему; выбор песни во вкладке возвращает порядок вкладки', async () => {
    const s = await loaded()
    await s.playFromPlaylist('aaaaaaaaaaaaaaaa')
    expect(s.currentId).toBe(ID(3))
    expect(s.queue.map(t => t.id)).toEqual([ID(3), ID(1)])
    await s.advance(true)
    expect(s.currentId).toBe(ID(1))
    await s.advance(true)
    expect(s.currentId).toBe(ID(3))
    await s.play(ID(2))
    expect(s.ctx).toBe('')
    expect(s.queue.map(t => t.id)).toEqual([ID(1), ID(2), ID(3)])
  })

  it('создать, добавить (повтор не добавляется), убрать песню, переименовать, удалить: запросы идут на сервер', async () => {
    const s = await loaded()
    const p = await s.createPlaylist('Утро', [ID(2)])
    expect(p.tracks).toEqual([ID(2)])
    expect(s.playlists.map(x => x.name)).toEqual(['Вечер', 'Утро'])
    expect(await s.addToPlaylist('aaaaaaaaaaaaaaaa', ID(2))).toBe(true)
    expect(await s.addToPlaylist('aaaaaaaaaaaaaaaa', ID(2))).toBe(false)
    expect(s.playlists[0]!.tracks).toEqual([ID(3), ID(1), ID(2)])
    await s.removeFromPlaylist('aaaaaaaaaaaaaaaa', ID(3))
    expect(s.playlists[0]!.tracks).toEqual([ID(1), ID(2)])
    await s.renamePlaylist('aaaaaaaaaaaaaaaa', 'Ночь')
    expect(s.playlists[0]!.name).toBe('Ночь')
    await s.playFromPlaylist('aaaaaaaaaaaaaaaa')
    await s.deletePlaylist('aaaaaaaaaaaaaaaa')
    expect(s.playlists.map(x => x.id)).toEqual(['bbbbbbbbbbbbbbbb'])
    expect(s.ctx, 'играющий плейлист удалили: порядок снова по вкладке').toBe('')
    expect(calls.filter(c => c.method === 'DELETE')).toHaveLength(1)
  })

  it('пустой плейлист не запускается', async () => {
    const s = await loaded()
    playlists = [{ id: 'cccccccccccccccc', name: 'Пусто', tracks: [], created: 1 }]
    await s.load()
    await s.playFromPlaylist('cccccccccccccccc')
    expect(s.currentId).toBe('')
    expect(s.ctx).toBe('')
  })

  it('плейлист пропал на сервере (удалили с другого устройства): порядок снова по вкладке', async () => {
    const s = await loaded()
    await s.playFromPlaylist('aaaaaaaaaaaaaaaa')
    playlists = []
    await s.load()
    expect(s.ctx).toBe('')
  })
})

describe('таймер сна', () => {
  it('через заданное время музыка плавно стихает и останавливается, громкость возвращается', async () => {
    const s = await loaded()
    await s.play(ID(1))
    vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] })
    s.setSleep(1)
    expect(s.sleepLeft).toBe(60)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(s.sleepLeft).toBe(30)
    expect(audio.paused).toBe(false)
    await vi.advanceTimersByTimeAsync(31_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(audio.paused).toBe(true)
    expect(audio.volume).toBeCloseTo(s.volume)
    expect(s.sleepEnd).toBe(0)
  })

  it('«после этой песни»: песня доиграла, дальше не идёт; выключение сбрасывает таймер', async () => {
    const s = await loaded()
    await s.play(ID(1))
    s.setSleep('track')
    expect(s.sleepTrack).toBe(true)
    audio.dispatchEvent(new Event('ended'))
    expect(s.sleepTrack).toBe(false)
    expect(s.currentId, 'следующая песня не началась').toBe(ID(1))
    s.setSleep(30)
    s.setSleep(0)
    expect(s.sleepEnd).toBe(0)
    expect(s.sleepLeft).toBe(0)
    audio.dispatchEvent(new Event('ended'))
    await Promise.resolve()
    expect(s.currentId, 'без таймера идёт дальше').toBe(ID(2))
  })
})

describe('поиск повторов при загрузке', () => {
  const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: 'audio/mpeg' })
  it('находит файлы с тем же размером или тем же названием без расширения, регистр и «_» не важны, и выбранные дважды', async () => {
    const s = await loaded()
    const same = file('другое имя.mp3', 1000) // размер как у «Песня 1»
    const title = file('песня_2.MP3', 12345) // название как у «Песня 2»
    const fresh = file('Новая песня.mp3', 777)
    const twin1 = file('Тихая.mp3', 555)
    const twin2 = file('тихая.mp3', 555)
    const r = s.splitDuplicates([same, title, fresh, twin1, twin2])
    expect(r.fresh).toEqual([fresh, twin1])
    expect(r.dups.map(d => [d.file.name, d.of])).toEqual([
      ['другое имя.mp3', 'Песня 1'],
      ['песня_2.MP3', 'Песня 2'],
      ['тихая.mp3', 'выбрана дважды'],
    ])
  })
  it('без повторов все файлы новые', async () => {
    const s = await loaded()
    const files = [file('a.mp3', 1), file('b.mp3', 2)]
    expect(s.splitDuplicates(files)).toEqual({ fresh: files, dups: [] })
  })
})
