import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Песня из списка владельца (сервер: `backend/src/music`). `cover`: подписанная ссылка или null (тогда рисуется обложка из набора). */
/** Вкладки плеера: тихая музыка и Nightcore (решение владельца 2026-11-14). Тот же список на сервере (`music.util.ts`). */
export const CATEGORIES = [
  { id: 'quiet', name: 'Тихая музыка' },
  { id: 'nightcore', name: 'Nightcore' },
] as const
export type Category = (typeof CATEGORIES)[number]['id']
const isCategory = (v: unknown): v is Category => CATEGORIES.some(c => c.id === v)

export interface Track {
  id: string
  title: string
  duration: number
  size: number
  created: number
  source: 'upload' | 'url'
  category: Category
  cover: string | null
}

/** Плейлист (на сервере таблица `music_playlists`): песни по порядку. */
export interface Playlist {
  id: string
  name: string
  tracks: string[]
  created: number
}

export type JobStage = 'info' | 'download' | 'convert' | 'save' | 'done' | 'error'
/** Задание на сервере: скачивание по ссылке или сохранение загруженного файла. */
export interface Job {
  id: string
  kind: 'upload' | 'url'
  stage: JobStage
  percent: number
  title: string
  text: string
  error?: string
  trackId?: string
}

/** Файл, который сейчас уходит с компьютера на сервер (процент передачи считает браузер). */
export interface UploadItem {
  key: number
  name: string
  percent: number
  error?: string
  /** сам файл и вкладка: нужны, чтобы повторить загрузку одной кнопкой после ошибки */
  file?: File
  category?: Category
  /** секунд до новой попытки, пока сервер просит подождать (лимит запросов 429) */
  wait?: number
}

export type RepeatMode = 'off' | 'all' | 'one'

/** Плеер доступен только владельцу с токеном (гостю и без входа кнопки и окна нет). Свой признак у каждого компонента. */
export function useMusicAvailable() {
  const progress = useProgressStore()
  return computed(() => progress.unlocked && !progress.isGuest)
}

const KEY = 'music_v1'
/** Лимит одной песни, МБ: то же число в backend/src/config.ts (`MAX_TRACK_MB`) и в Caddy (docker/caddy/Caddyfile). */
export const MAX_TRACK_MB = 350
const POLL_MS = 1000
/** Сервер пускает не больше 40 загрузок в минуту с одного адреса (429): между файлами пауза, при 429 ждём и повторяем сами. */
const UPLOAD_GAP_MS = 1600
const UPLOAD_TRIES = 4
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const REPEAT: RepeatMode[] = ['off', 'all', 'one']
/** Сколько песен можно поставить в очередь «играть следом». */
const MAX_UP_NEXT = 100

interface Saved {
  tab: Category
  id: string
  time: number
  volume: number
  repeat: RepeatMode
  shuffle: boolean
  /** id играющего плейлиста или пусто (играет вкладка) */
  ctx: string
  /** очередь «играть следом» */
  upNext: string[]
}

function readSaved(): Saved {
  const d: Saved = { tab: 'quiet', id: '', time: 0, volume: 0.8, repeat: 'all', shuffle: false, ctx: '', upNext: [] }
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Saved> | null
    if (!r || typeof r !== 'object') return d
    return {
      tab: isCategory(r.tab) ? r.tab : d.tab,
      id: typeof r.id === 'string' ? r.id : '',
      time: typeof r.time === 'number' && r.time >= 0 ? r.time : 0,
      volume: typeof r.volume === 'number' && r.volume >= 0 && r.volume <= 1 ? r.volume : d.volume,
      repeat: REPEAT.includes(r.repeat as RepeatMode) ? (r.repeat as RepeatMode) : d.repeat,
      shuffle: r.shuffle === true,
      ctx: typeof r.ctx === 'string' ? r.ctx : '',
      upNext: Array.isArray(r.upNext) ? r.upNext.filter((x): x is string => typeof x === 'string').slice(0, MAX_UP_NEXT) : [],
    }
  } catch {
    return d
  }
}

/**
 * Музыкальный плеер. Звук играет из одного `Audio` в этом хранилище, а не из страницы: переход между страницами сайта звук не обрывает
 * (полная перезагрузка страницы обрывает; браузер не даёт запускать звук сам, поэтому песня и место запоминаются и ждут нажатия «играть»).
 */
export const useMusicStore = defineStore('music', () => {
  const progress = useProgressStore()
  const toast = useToastStore()

  const tracks = ref<Track[]>([])
  const jobs = ref<Job[]>([])
  const uploads = ref<UploadItem[]>([])
  const loaded = ref(false)
  const loadError = ref('')
  const open = ref(false)

  const saved = import.meta.client ? readSaved() : { tab: 'quiet' as Category, id: '', time: 0, volume: 0.8, repeat: 'all' as RepeatMode, shuffle: false, ctx: '', upNext: [] as string[] }
  const currentId = ref(saved.id)
  const playing = ref(false)
  const time = ref(saved.time)
  const length = ref(0)
  const volume = ref(saved.volume)
  const muted = ref(false)
  const repeat = ref<RepeatMode>(saved.repeat)
  const shuffle = ref(saved.shuffle)
  const playlists = ref<Playlist[]>([])
  /** Что играет сейчас: id плейлиста (дальше и назад идут по нему) или пусто (по вкладке). */
  const ctx = ref(saved.ctx)
  /** Очередь «играть следом»: эти песни сыграют раньше обычного порядка, по одной. */
  const upNext = ref<string[]>(saved.upNext)
  /** Таймер сна: конец (мс) или 0; «после этой песни»; текущее время для обратного отсчёта. */
  const sleepEnd = ref(0)
  const sleepTrack = ref(false)
  const nowMs = ref(Date.now())
  const sleepLeft = computed(() => (sleepEnd.value ? Math.max(0, Math.ceil((sleepEnd.value - nowMs.value) / 1000)) : 0))

  /** Открытая вкладка списка. */
  const tab = ref<Category>(saved.tab)
  /** Песни открытой вкладки (их показывает список). */
  const visible = computed(() => tracks.value.filter(t => t.category === tab.value))
  const current = computed(() => tracks.value.find(t => t.id === currentId.value) ?? null)
  /** Очередь: песни той вкладки, в которой играет текущая (переключение вкладки музыку не сбивает). */
  const queue = computed(() => {
    const pl = ctx.value ? playlists.value.find(p => p.id === ctx.value) : undefined
    if (pl) return pl.tracks.map(id => tracks.value.find(t => t.id === id)).filter((t): t is Track => !!t)
    const cat = current.value?.category ?? tab.value
    return tracks.value.filter(t => t.category === cat)
  })
  const index = computed(() => queue.value.findIndex(t => t.id === currentId.value))
  /** Задания для показа: готовые исчезают через 3 секунды, неудавшиеся остаются, пока их не уберут крестиком. */
  const hiddenJobs = ref<string[]>([])
  const shownJobs = computed(() => jobs.value.filter(j => !hiddenJobs.value.includes(j.id)))
  /** Сколько задач идёт прямо сейчас (передача файла и задания сервера). */
  const busy = computed(() => uploads.value.some(u => !u.error && u.percent < 100) || jobs.value.some(j => j.stage !== 'done' && j.stage !== 'error'))

  const headers = () => ({ Authorization: `Bearer ${progress.bearer}` })
  const jsonHeaders = () => ({ ...headers(), 'Content-Type': 'application/json' })

  /* ---------- запоминание ---------- */
  let lastSave = 0
  function save(force = false) {
    if (!import.meta.client) return
    if (!force && Date.now() - lastSave < 5000) return
    lastSave = Date.now()
    try {
      localStorage.setItem(KEY, JSON.stringify({ tab: tab.value, id: currentId.value, time: time.value, volume: volume.value, repeat: repeat.value, shuffle: shuffle.value, ctx: ctx.value, upNext: upNext.value } satisfies Saved))
    } catch {
      /* без запоминания */
    }
  }

  /* ---------- звук ---------- */
  let audio: HTMLAudioElement | null = null
  /** С какой секунды начать, когда песня загрузится (после обновления страницы). */
  let pendingSeek = saved.time
  /** Один повтор получения ссылки, если подписанная ссылка устарела посреди песни. */
  let retried = ''

  function el(): HTMLAudioElement {
    if (audio) return audio
    audio = new Audio()
    audio.preload = 'none'
    audio.volume = volume.value
    audio.addEventListener('timeupdate', () => {
      time.value = audio!.currentTime
      save()
    })
    audio.addEventListener('loadedmetadata', () => {
      length.value = Number.isFinite(audio!.duration) ? audio!.duration : 0
      if (pendingSeek > 0 && pendingSeek < audio!.duration) audio!.currentTime = pendingSeek
      pendingSeek = 0
    })
    audio.addEventListener('play', () => (playing.value = true))
    audio.addEventListener('pause', () => {
      playing.value = false
      save(true)
    })
    audio.addEventListener('ended', () => {
      // таймер сна «после этой песни»: песня доиграла, дальше не идём
      if (sleepTrack.value) {
        sleepTrack.value = false
        toast.ok('Таймер сна: музыка остановлена')
        return
      }
      void advance(false)
    })
    audio.addEventListener('error', () => void recover())
    return audio
  }

  async function streamUrl(id: string) {
    const res = await fetchT(`/api/music/${id}/url`, { headers: headers() })
    if (!res.ok) throw new Error(res.status === 404 ? 'песни нет в списке' : `ошибка сервера ${res.status}`)
    return ((await res.json()) as { url: string }).url
  }

  /** Подставляет файл песни в проигрыватель (без запуска). */
  async function attach(id: string) {
    const a = el()
    a.src = await streamUrl(id)
    time.value = pendingSeek // после обновления страницы показываем запомненное место, а не ноль
    length.value = current.value?.duration ?? 0
  }

  async function recover() {
    const id = currentId.value
    if (!id || retried === id) {
      if (id) toast.error('Не получилось воспроизвести песню')
      playing.value = false
      return
    }
    retried = id
    const at = time.value
    try {
      pendingSeek = at
      await attach(id)
      if (playing.value || at > 0) await el().play()
    } catch (e) {
      toast.error(`Песня не открылась: ${errText(e)}`)
      playing.value = false
    }
  }

  /** Нажали на песню в списке вкладки (или «играть»): играет песня, плейлист больше порядок не ведёт. */
  async function play(id?: string) {
    if (id && id !== currentId.value) ctx.value = ''
    await startTrack(id)
  }

  /** Запускает песню, не меняя, что ведёт порядок (вкладка или плейлист): так идут «дальше» и «назад». */
  async function startTrack(id?: string) {
    const target = id ?? (currentId.value || visible.value[0]?.id)
    if (!target) return
    try {
      if (target !== currentId.value || !el().src) {
        const same = target === currentId.value
        currentId.value = target
        retried = ''
        if (!same) pendingSeek = 0
        await attach(target)
        mediaSession()
      }
      await el().play()
    } catch (e) {
      playing.value = false
      toast.error(`Песня не открылась: ${errText(e)}`)
    }
  }

  function pause() {
    audio?.pause()
  }

  async function toggle() {
    if (playing.value) pause()
    else await play()
  }

  function randomOther() {
    const others = queue.value.filter(t => t.id !== currentId.value)
    return others.length ? others[Math.floor(Math.random() * others.length)]!.id : currentId.value
  }

  /** Следующая песня; `manual`: нажали кнопку (в конце списка при «без повтора» переходим к первой), иначе песня закончилась сама. */
  async function advance(manual: boolean) {
    if (!queue.value.length) return
    if (!manual && repeat.value === 'one') {
      el().currentTime = 0
      await el().play().catch(() => undefined)
      return
    }
    // очередь «играть следом» идёт раньше обычного порядка
    while (upNext.value.length) {
      const id = upNext.value[0]!
      upNext.value = upNext.value.slice(1)
      save(true)
      if (tracks.value.some(t => t.id === id)) return void (await startTrack(id))
    }
    let nextId: string
    if (shuffle.value) nextId = randomOther()
    else {
      const i = index.value + 1
      if (i >= queue.value.length) {
        if (!manual && repeat.value === 'off') return void pause()
        nextId = queue.value[0]!.id
      } else nextId = queue.value[i]!.id
    }
    // песня в очереди одна (длинный сборник): «дальше» начинает её заново, а не молчит
    if (nextId === currentId.value && audio?.src) {
      audio.currentTime = 0
      time.value = 0
      await audio.play().catch(() => undefined)
      return
    }
    await startTrack(nextId)
  }

  async function prev() {
    if (!queue.value.length) return
    if (time.value > 3) return seek(0)
    const i = index.value <= 0 ? queue.value.length - 1 : index.value - 1
    await startTrack(shuffle.value ? randomOther() : queue.value[i]!.id)
  }

  function seek(sec: number) {
    const a = el()
    const max = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : length.value
    const t = Math.max(0, Math.min(sec, max || sec))
    if (a.src) a.currentTime = t
    else pendingSeek = t
    time.value = t
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v))
    muted.value = false
    if (audio) {
      audio.volume = volume.value
      audio.muted = false
    }
    save(true)
  }

  function toggleMute() {
    muted.value = !muted.value
    if (audio) audio.muted = muted.value
  }

  function cycleRepeat() {
    repeat.value = REPEAT[(REPEAT.indexOf(repeat.value) + 1) % REPEAT.length]!
    save(true)
  }

  /** Останавливает звук и убирает мини-плеер: песня снимается (после «закрыть» играть нужно выбрать заново). */
  function stop() {
    setSleep(0)
    pause()
    currentId.value = ''
    pendingSeek = 0
    if (audio) audio.removeAttribute('src')
    time.value = 0
    length.value = 0
    retried = ''
    save(true)
  }

  function setTab(c: Category) {
    tab.value = c
    save(true)
  }

  function toggleShuffle() {
    shuffle.value = !shuffle.value
    save(true)
  }

  /* ---------- очередь «играть следом» ---------- */
  /** Песня встаёт первой в очереди: сыграет сразу после текущей. */
  function playNext(id: string) {
    upNext.value = [id, ...upNext.value].slice(0, MAX_UP_NEXT)
    save(true)
  }
  /** Песня в конец очереди. */
  function enqueue(id: string) {
    if (upNext.value.length < MAX_UP_NEXT) upNext.value = [...upNext.value, id]
    save(true)
  }
  function unqueue(at: number) {
    upNext.value = upNext.value.filter((_, i) => i !== at)
    save(true)
  }
  function clearQueue() {
    upNext.value = []
    save(true)
  }

  /* ---------- таймер сна ---------- */
  let sleepTimer: ReturnType<typeof setInterval> | undefined
  /** Плавно приглушает звук (4 секунды), останавливает и возвращает прежнюю громкость. */
  async function fadeOut() {
    const a = audio
    if (!a || a.paused) return
    for (let step = 1; step <= 8; step++) {
      a.volume = volume.value * (1 - step / 8)
      await sleep(500)
    }
    a.pause()
    a.volume = volume.value
  }
  /** Таймер сна: через `m` минут музыка стихает и останавливается; `'track'`: после этой песни; `0`: выключить. */
  function setSleep(m: number | 'track') {
    clearInterval(sleepTimer)
    sleepTimer = undefined
    sleepEnd.value = 0
    sleepTrack.value = false
    if (m === 'track') {
      sleepTrack.value = true
      return
    }
    if (!(m > 0) || !import.meta.client) return
    nowMs.value = Date.now()
    sleepEnd.value = nowMs.value + m * 60_000
    sleepTimer = setInterval(() => {
      nowMs.value = Date.now()
      if (nowMs.value < sleepEnd.value) return
      clearInterval(sleepTimer)
      sleepTimer = undefined
      sleepEnd.value = 0
      void fadeOut().then(() => toast.ok('Таймер сна: музыка остановлена'))
    }, 1000)
  }

  /* ---------- плейлисты (хранятся на сервере) ---------- */
  const plUrl = (id = '') => `/api/music/playlists${id ? `/${id}` : ''}`
  const plError = (status: number) => (status === 400 ? 'Название пустое, слишком длинное или плейлистов уже 50' : `ошибка сервера ${status}`)
  const putPlaylist = (p: Playlist) => (playlists.value = playlists.value.map(x => (x.id === p.id ? p : x)))

  async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist> {
    const res = await fetchT(plUrl(), { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name, tracks: trackIds }) })
    if (!res.ok) throw new Error(plError(res.status))
    const p = (await res.json()) as Playlist
    playlists.value = [...playlists.value, p]
    return p
  }

  async function patchPlaylist(id: string, body: { name?: string; tracks?: string[] }) {
    const res = await fetchT(plUrl(id), { method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(plError(res.status))
    putPlaylist((await res.json()) as Playlist)
  }

  const renamePlaylist = (id: string, name: string) => patchPlaylist(id, { name })
  const setPlaylistTracks = (id: string, ids: string[]) => patchPlaylist(id, { tracks: ids })

  /** Песня в плейлист (в конец); `false`, если она там уже есть. */
  async function addToPlaylist(plId: string, trackId: string): Promise<boolean> {
    const pl = playlists.value.find(p => p.id === plId)
    if (!pl || pl.tracks.includes(trackId)) return false
    await patchPlaylist(plId, { tracks: [...pl.tracks, trackId] })
    return true
  }

  async function removeFromPlaylist(plId: string, trackId: string) {
    const pl = playlists.value.find(p => p.id === plId)
    if (pl) await patchPlaylist(plId, { tracks: pl.tracks.filter(id => id !== trackId) })
  }

  async function deletePlaylist(id: string) {
    const res = await fetchT(plUrl(id), { method: 'DELETE', headers: headers() })
    if (!res.ok && res.status !== 404) throw new Error(`ошибка сервера ${res.status}`)
    playlists.value = playlists.value.filter(p => p.id !== id)
    if (ctx.value === id) {
      ctx.value = ''
      save(true)
    }
  }

  /** Играть плейлист (с песни `trackId` или с первой, при «вперемешку» со случайной): «дальше» и «назад» идут по нему. */
  async function playFromPlaylist(plId: string, trackId?: string) {
    const pl = playlists.value.find(p => p.id === plId)
    const list = pl?.tracks.filter(id => tracks.value.some(t => t.id === id)) ?? []
    if (!pl || !list.length) return void toast.error('В плейлисте нет песен')
    ctx.value = plId
    save(true)
    const first = trackId && list.includes(trackId) ? trackId : shuffle.value ? list[Math.floor(Math.random() * list.length)]! : list[0]!
    await startTrack(first)
  }

  /** Кнопки на экране блокировки и в наушниках. */
  function mediaSession() {
    if (!import.meta.client || !('mediaSession' in navigator) || !current.value) return
    const t = current.value
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: '우리말', artwork: t.cover ? [{ src: t.cover }] : [] })
    navigator.mediaSession.setActionHandler('play', () => void play())
    navigator.mediaSession.setActionHandler('pause', () => pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => void prev())
    navigator.mediaSession.setActionHandler('nexttrack', () => void advance(true))
    navigator.mediaSession.setActionHandler('seekto', d => d.seekTime !== undefined && seek(d.seekTime))
  }

  /* ---------- список и задания ---------- */
  const finished = new Set<string>()
  let pollTimer: ReturnType<typeof setTimeout> | undefined

  async function load() {
    if (!progress.unlocked || progress.isGuest) return
    try {
      const res = await fetchT('/api/music', { headers: headers() })
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      const d = (await res.json()) as { tracks: Track[]; jobs: Job[]; playlists?: Playlist[] }
      tracks.value = d.tracks
      jobs.value = d.jobs
      playlists.value = d.playlists ?? []
      // плейлиста уже нет (удалили с другого устройства): порядок снова по вкладке; песен, которых нет в списке, в очереди не остаётся
      if (ctx.value && !playlists.value.some(p => p.id === ctx.value)) ctx.value = ''
      upNext.value = upNext.value.filter(id => d.tracks.some(t => t.id === id))
      loadError.value = ''
      // итог каждого задания показываем один раз плашкой
      for (const j of d.jobs) {
        if ((j.stage === 'done' || j.stage === 'error') && !finished.has(j.id)) {
          if (loaded.value) j.stage === 'done' ? toast.ok(`Добавлено: ${j.title}`) : toast.error(`Не добавилось: ${j.error ?? 'ошибка'}`)
          finished.add(j.id)
          // готовое было и до этой загрузки списка (страницу открыли позже): сразу убираем
          if (j.stage === 'done') setTimeout(() => dismissJob(j.id), loaded.value ? 3000 : 0)
        }
      }
      if (currentId.value && !d.tracks.some(t => t.id === currentId.value)) {
        currentId.value = ''
        pendingSeek = 0
        pause()
      }
      loaded.value = true
    } catch (e) {
      loadError.value = errText(e)
    }
    schedulePoll()
  }

  function schedulePoll() {
    clearTimeout(pollTimer)
    pollTimer = undefined
    if (busy.value && import.meta.client) pollTimer = setTimeout(() => void load(), POLL_MS)
  }

  /* ---------- добавить ---------- */
  /** Передаёт один файл; 429 не считается ошибкой здесь (его обрабатывает runUpload: ждёт и повторяет). */
  function sendFile(file: File, item: UploadItem, category: Category) {
    return new Promise<{ status: number; retryAfter: number }>(resolve => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/music/upload')
      xhr.setRequestHeader('Authorization', `Bearer ${progress.bearer}`)
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) item.percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status === 202) item.percent = 100
        else if (xhr.status !== 429) item.error = xhr.status === 400 ? 'Не подходит: нужен звуковой файл (mp3, m4a, ogg, flac, wav)' : xhr.status === 413 ? `Файл больше ${MAX_TRACK_MB} МБ` : `Ошибка сервера ${xhr.status}`
        resolve({ status: xhr.status, retryAfter: Number(xhr.getResponseHeader('Retry-After')) || 60 })
      }
      xhr.onerror = () => {
        item.error = 'Сервер недоступен'
        resolve({ status: 0, retryAfter: 0 })
      }
      xhr.ontimeout = xhr.onerror
      const form = new FormData()
      form.append('file', file)
      form.append('category', category)
      xhr.send(form)
    })
  }

  /** Одна загрузка с повторами: при 429 ждёт, сколько просит сервер, и пробует снова (до UPLOAD_TRIES раз); ошибка остаётся в строке с кнопкой «Повторить». */
  async function runUpload(item: UploadItem) {
    const file = item.file!
    item.error = undefined
    item.percent = 0
    if (file.size > MAX_TRACK_MB * 1024 * 1024) item.error = `Файл ${Math.round(file.size / 1048576)} МБ: больше лимита ${MAX_TRACK_MB} МБ`
    else {
      for (let attempt = 1; attempt <= UPLOAD_TRIES; attempt++) {
        const r = await sendFile(file, item, item.category ?? tab.value)
        if (r.status !== 429) break
        if (attempt === UPLOAD_TRIES) {
          item.error = 'Слишком много загрузок подряд (лимит сервера 40 в минуту): нажми «Повторить»'
          break
        }
        for (let s = Math.min(r.retryAfter, 90); s > 0; s--) {
          item.wait = s
          await sleep(1000)
        }
        item.wait = 0
        item.percent = 0
      }
    }
    item.wait = 0
    if (item.error) toast.error(`${item.name}: ${item.error}`)
    await load()
    // строка передачи уходит, как только задание сервера видно в списке
    uploads.value = uploads.value.filter(u => u.key !== item.key || !!u.error)
  }

  /**
   * Файлы, которые уже есть в плеере (тот же размер в байтах или то же название без расширения, регистр и «_» не важны) или выбраны дважды.
   * Возвращает новые файлы и повторы с пометкой, на что они похожи.
   */
  function splitDuplicates(files: File[]): { fresh: File[]; dups: { file: File; of: string }[] } {
    const stem = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_\s]+/g, ' ').trim().toLowerCase()
    const fresh: File[] = []
    const dups: { file: File; of: string }[] = []
    for (const f of files) {
      const hit = tracks.value.find(t => (t.size > 0 && t.size === f.size) || stem(t.title) === stem(f.name))
      const twin = fresh.find(x => x.size === f.size && stem(x.name) === stem(f.name))
      if (hit) dups.push({ file: f, of: hit.title })
      else if (twin) dups.push({ file: f, of: 'выбрана дважды' })
      else fresh.push(f)
    }
    return { fresh, dups }
  }

  /** Файлы с компьютера (выбрать или перетащить): по одному, между файлами короткая пауза, чтобы не упереться в лимит запросов. */
  async function uploadFiles(files: File[]) {
    const cat = tab.value // вкладка, открытая в момент выбора файлов
    for (const [i, file] of files.entries()) {
      if (i > 0) await sleep(UPLOAD_GAP_MS)
      uploads.value.push({ key: Date.now() + Math.random(), name: file.name, percent: 0, file: markRaw(file), category: cat })
      await runUpload(uploads.value[uploads.value.length - 1]!) // реактивная запись: сюда пишет процент передачи
    }
  }

  /** Повторить загрузку, которая закончилась ошибкой (файл ещё в памяти страницы). */
  async function retryUpload(key: number) {
    const item = uploads.value.find(u => u.key === key)
    if (item?.file && item.error) await runUpload(item)
  }

  /** Повторить все упавшие загрузки по очереди. */
  async function retryFailed() {
    const keys = uploads.value.filter(u => u.error && u.file).map(u => u.key)
    for (const [i, key] of keys.entries()) {
      if (i > 0) await sleep(UPLOAD_GAP_MS)
      await retryUpload(key)
    }
  }

  function dismissUpload(key: number) {
    uploads.value = uploads.value.filter(u => u.key !== key)
  }

  function dismissJob(id: string) {
    if (!hiddenJobs.value.includes(id)) hiddenJobs.value.push(id)
  }

  async function addUrl(url: string) {
    const res = await fetchT('/api/music/url', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ url, category: tab.value }) })
    if (res.status === 409) throw new Error('Уже идёт скачивание по ссылке: дождись конца')
    if (res.status === 400) throw new Error('Нужна ссылка вида https://…')
    if (res.status === 429) throw new Error('Слишком много запросов подряд: подожди минуту и нажми «Скачать» снова')
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    await load()
  }

  async function rename(id: string, title: string) {
    const res = await fetchT(`/api/music/${id}`, { method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify({ title }) })
    if (!res.ok) throw new Error(res.status === 400 ? 'Название пустое или слишком длинное' : `ошибка сервера ${res.status}`)
    const t = tracks.value.find(x => x.id === id)
    if (t) t.title = ((await res.json()) as Track).title
    if (id === currentId.value) mediaSession()
  }

  /** Переносит песню в другую вкладку. */
  async function setCategory(id: string, category: Category) {
    const res = await fetchT(`/api/music/${id}`, { method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify({ category }) })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    const t = tracks.value.find(x => x.id === id)
    if (t) t.category = category
  }

  async function remove(id: string) {
    const res = await fetchT(`/api/music/${id}`, { method: 'DELETE', headers: headers() })
    if (!res.ok && res.status !== 404) throw new Error(`ошибка сервера ${res.status}`)
    if (id === currentId.value) {
      pause()
      currentId.value = ''
      pendingSeek = 0
      if (audio) audio.removeAttribute('src')
      time.value = 0
      length.value = 0
    }
    tracks.value = tracks.value.filter(t => t.id !== id)
    upNext.value = upNext.value.filter(x => x !== id)
    playlists.value = playlists.value.map(p => ({ ...p, tracks: p.tracks.filter(x => x !== id) }))
  }

  return {
    tracks, visible, queue, tab, jobs, shownJobs, uploads, loaded, loadError, open, current, currentId, index, playing, time, length, volume, muted, repeat, shuffle, busy,
    playlists, ctx, upNext, sleepEnd, sleepTrack, sleepLeft, setSleep, playNext, enqueue, unqueue, clearQueue, createPlaylist, renamePlaylist, setPlaylistTracks, addToPlaylist, removeFromPlaylist, deletePlaylist, playFromPlaylist, splitDuplicates,
    load, play, pause, toggle, advance, prev, seek, setVolume, toggleMute, cycleRepeat, toggleShuffle, stop, setTab, setCategory, uploadFiles, retryUpload, retryFailed, dismissUpload, dismissJob, addUrl, rename, remove,
  }
})
