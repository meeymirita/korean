import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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
}

export type RepeatMode = 'off' | 'all' | 'one'

const KEY = 'music_v1'
/** Лимит одной песни, МБ: то же число в backend/src/config.ts (`MAX_TRACK_MB`) и в Caddy (docker/caddy/Caddyfile). */
export const MAX_TRACK_MB = 350
const POLL_MS = 1000
const REPEAT: RepeatMode[] = ['off', 'all', 'one']

interface Saved {
  tab: Category
  id: string
  time: number
  volume: number
  repeat: RepeatMode
  shuffle: boolean
}

function readSaved(): Saved {
  const d: Saved = { tab: 'quiet', id: '', time: 0, volume: 0.8, repeat: 'all', shuffle: false }
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

  const saved = import.meta.client ? readSaved() : { tab: 'quiet' as Category, id: '', time: 0, volume: 0.8, repeat: 'all' as RepeatMode, shuffle: false }
  const currentId = ref(saved.id)
  const playing = ref(false)
  const time = ref(saved.time)
  const length = ref(0)
  const volume = ref(saved.volume)
  const muted = ref(false)
  const repeat = ref<RepeatMode>(saved.repeat)
  const shuffle = ref(saved.shuffle)

  /** Открытая вкладка списка. */
  const tab = ref<Category>(saved.tab)
  /** Песни открытой вкладки (их показывает список). */
  const visible = computed(() => tracks.value.filter(t => t.category === tab.value))
  const current = computed(() => tracks.value.find(t => t.id === currentId.value) ?? null)
  /** Очередь: песни той вкладки, в которой играет текущая (переключение вкладки музыку не сбивает). */
  const queue = computed(() => {
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
      localStorage.setItem(KEY, JSON.stringify({ tab: tab.value, id: currentId.value, time: time.value, volume: volume.value, repeat: repeat.value, shuffle: shuffle.value } satisfies Saved))
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
    audio.addEventListener('ended', () => void advance(false))
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

  async function play(id?: string) {
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
    let nextId: string
    if (shuffle.value) nextId = randomOther()
    else {
      const i = index.value + 1
      if (i >= queue.value.length) {
        if (!manual && repeat.value === 'off') return void pause()
        nextId = queue.value[0]!.id
      } else nextId = queue.value[i]!.id
    }
    await play(nextId)
  }

  async function prev() {
    if (!queue.value.length) return
    if (time.value > 3) return seek(0)
    const i = index.value <= 0 ? queue.value.length - 1 : index.value - 1
    await play(shuffle.value ? randomOther() : queue.value[i]!.id)
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

  function setTab(c: Category) {
    tab.value = c
    save(true)
  }

  function toggleShuffle() {
    shuffle.value = !shuffle.value
    save(true)
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
      const d = (await res.json()) as { tracks: Track[]; jobs: Job[] }
      tracks.value = d.tracks
      jobs.value = d.jobs
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
  function sendFile(file: File, item: UploadItem, category: Category) {
    return new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/music/upload')
      xhr.setRequestHeader('Authorization', `Bearer ${progress.bearer}`)
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) item.percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status === 202) item.percent = 100
        else item.error = xhr.status === 400 ? 'Не подходит: нужен звуковой файл (mp3, m4a, ogg, flac, wav)' : xhr.status === 413 ? `Файл больше ${MAX_TRACK_MB} МБ` : `Ошибка сервера ${xhr.status}`
        resolve()
      }
      xhr.onerror = () => {
        item.error = 'Сервер недоступен'
        resolve()
      }
      xhr.ontimeout = xhr.onerror
      const form = new FormData()
      form.append('file', file)
      form.append('category', category)
      xhr.send(form)
    })
  }

  /** Файлы с компьютера (выбрать или перетащить): по одному, чтобы не забивать канал. */
  async function uploadFiles(files: File[]) {
    const cat = tab.value // вкладка, открытая в момент выбора файлов
    for (const file of files) {
      uploads.value.push({ key: Date.now() + Math.random(), name: file.name, percent: 0 })
      const item = uploads.value[uploads.value.length - 1]! // реактивная запись: сюда пишет процент передачи
      if (file.size > MAX_TRACK_MB * 1024 * 1024) item.error = `Файл ${Math.round(file.size / 1048576)} МБ: больше лимита ${MAX_TRACK_MB} МБ`
      else await sendFile(file, item, cat)
      if (item.error) toast.error(`${file.name}: ${item.error}`)
      await load()
      // строка передачи уходит, как только задание сервера видно в списке
      uploads.value = uploads.value.filter(u => u.key !== item.key || !!u.error)
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
  }

  return {
    tracks, visible, queue, tab, jobs, shownJobs, uploads, loaded, loadError, open, current, currentId, index, playing, time, length, volume, muted, repeat, shuffle, busy,
    load, play, pause, toggle, advance, prev, seek, setVolume, toggleMute, cycleRepeat, toggleShuffle, setTab, setCategory, uploadFiles, dismissUpload, dismissJob, addUrl, rename, remove,
  }
})
