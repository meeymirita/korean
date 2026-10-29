import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { DAILY_GOAL, GOAL_OPTIONS, levelInfo, levelOf } from '@/data/levels'

export interface WordStat {
  ok: number
  bad: number
  /** верных ответов подряд */
  streak: number
  last: number
  /** когда слово впервые стало выученным */
  kd?: number
}

export interface LogEntry {
  t: number
  w: string | null
  ok: boolean
  s: string
}

export interface Profile {
  name: string
  /** эмодзи или картинка data:image/… */
  avatar: string
}

export interface Settings {
  goal: number
  /** темы словаря для «Сегодня» (пусто — все) */
  cats: string[]
  /** группы слов игры (null — как выбрано в самой игре) */
  gameCats: Record<string, number> | null
}

export interface ProgressData {
  v: 1
  updated: number
  xp: number
  /** дата → число верных ответов за день (ключ есть, если в этот день отвечала хоть раз) */
  days: Record<string, number>
  /** дата → все ответы за день */
  all: Record<string, number>
  words: Record<string, WordStat>
  sources: Record<string, { ok: number; bad: number }>
  /** последние ответы, новые первыми */
  log: LogEntry[]
  profile: Profile
  settings: Settings
}

export type WordStatus = 'new' | 'learning' | 'known'
export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error'

const KEY = 'progress_v1'
const TOKEN_KEY = 'progress_token'
const VERIFIED_KEY = 'progress_verified'
const LOG_MAX = 300
/** Слово считается выученным после трёх верных ответов подряд. */
export const KNOWN_STREAK = 3

const emptyProfile = (): Profile => ({ name: '', avatar: '🌸' })
const emptySettings = (): Settings => ({ goal: DAILY_GOAL, cats: [], gameCats: null })
const empty = (): ProgressData => ({
  v: 1, updated: 0, xp: 0, days: {}, all: {}, words: {}, sources: {}, log: [],
  profile: emptyProfile(), settings: emptySettings(),
})

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const obj = <T extends object>(v: unknown, fallback: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback)

/** Приводит данные из файла или с сервера к безопасному виду; старые версии без новых полей тоже принимаются. */
export function normalize(raw: unknown): ProgressData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<ProgressData>
  if (r.v !== 1) return null
  const profile = obj<Partial<Profile>>(r.profile, {})
  const settings = obj<Partial<Settings>>(r.settings, {})
  return {
    v: 1,
    updated: Number(r.updated) || 0,
    xp: Number(r.xp) || 0,
    days: obj(r.days, {}),
    all: obj(r.all, {}),
    words: obj(r.words, {}),
    sources: obj(r.sources, {}),
    log: Array.isArray(r.log) ? r.log.slice(0, LOG_MAX) : [],
    profile: {
      name: typeof profile.name === 'string' ? profile.name.slice(0, 24) : '',
      avatar: typeof profile.avatar === 'string' && profile.avatar ? profile.avatar : '🌸',
    },
    settings: {
      goal: GOAL_OPTIONS.includes(Number(settings.goal)) ? Number(settings.goal) : DAILY_GOAL,
      cats: Array.isArray(settings.cats) ? settings.cats.filter(c => typeof c === 'string') : [],
      gameCats: settings.gameCats && typeof settings.gameCats === 'object' ? settings.gameCats : null,
    },
  }
}

function load(): ProgressData {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')) ?? empty()
  } catch {
    return empty()
  }
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k) || ''
  } catch {
    return ''
  }
}
const write = (k: string, v: string | null) => {
  try {
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)
  } catch {
    /* без запоминания в браузере */
  }
}

export const useProgressStore = defineStore('progress', () => {
  const data = ref<ProgressData>(load())
  const token = ref(read(TOKEN_KEY))
  /** токен хотя бы раз подошёл серверу: до этого функции сайта закрыты */
  const verified = ref(read(VERIFIED_KEY) === '1')
  const sync = ref<SyncState>(token.value ? 'idle' : 'off')
  const syncMessage = ref('')
  let applying = false
  let timer: ReturnType<typeof setTimeout> | undefined

  /* ---------- доступ ---------- */
  const unlocked = computed(() => !!token.value && verified.value)

  function lock(message = '') {
    token.value = ''
    verified.value = false
    write(TOKEN_KEY, null)
    write(VERIFIED_KEY, null)
    sync.value = message ? 'error' : 'off'
    syncMessage.value = message
  }

  /* ---------- вычисляемое ---------- */
  const goal = computed(() => data.value.settings.goal)
  const info = computed(() => levelInfo(data.value.xp))
  const todayOk = computed(() => data.value.days[dayKey()] ?? 0)
  const goalDone = computed(() => todayOk.value >= goal.value)

  /** Серия дней подряд: если сегодня ещё не занималась, считается от вчера. */
  const streak = computed(() => {
    const days = data.value.days
    const d = new Date()
    if (!(dayKey(d) in days)) d.setDate(d.getDate() - 1)
    let n = 0
    while (dayKey(d) in days) {
      n++
      d.setDate(d.getDate() - 1)
    }
    return n
  })
  const bestStreak = computed(() => {
    const keys = Object.keys(data.value.days).sort()
    let best = 0
    let run = 0
    let prev: Date | null = null
    for (const k of keys) {
      const cur = new Date(k + 'T00:00:00')
      run = prev && Math.round((cur.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1
      best = Math.max(best, run)
      prev = cur
    }
    return best
  })

  const status = (word: string): WordStatus => {
    const w = data.value.words[word]
    if (!w) return 'new'
    return w.streak >= KNOWN_STREAK ? 'known' : 'learning'
  }

  /* ---------- запись ответа ---------- */
  function record(o: { word?: string | null; ok: boolean; source: string; xp?: number }) {
    const d = data.value
    const before = levelOf(d.xp)
    const src = (d.sources[o.source] ??= { ok: 0, bad: 0 })
    o.ok ? src.ok++ : src.bad++

    let bloomed = false
    if (o.word) {
      const w = (d.words[o.word] ??= { ok: 0, bad: 0, streak: 0, last: 0 })
      if (o.ok) {
        w.ok++
        w.streak++
        if (w.streak >= KNOWN_STREAK && !w.kd) {
          w.kd = Date.now()
          bloomed = true
        }
      } else {
        w.bad++
        w.streak = 0
      }
      w.last = Date.now()
    }

    const k = dayKey()
    d.days[k] ??= 0
    d.all[k] = (d.all[k] ?? 0) + 1
    d.log.unshift({ t: Date.now(), w: o.word ?? null, ok: o.ok, s: o.source })
    if (d.log.length > LOG_MAX) d.log.length = LOG_MAX

    let goalReached = false
    if (o.ok) {
      d.xp += o.xp ?? 10
      d.days[k]!++
      goalReached = d.days[k] === goal.value
    }
    d.updated = Date.now()
    const level = levelOf(d.xp)
    return { level, levelUp: level > before, goalReached, bloomed, title: levelInfo(d.xp).title }
  }

  /** Один раз переносит очки старой версии игры. */
  function importXp(xp: number) {
    if (xp > data.value.xp) {
      data.value.xp = xp
      data.value.updated = Date.now()
    }
  }

  /* ---------- профиль и настройки ---------- */
  function setProfile(p: Partial<Profile>) {
    if (p.name !== undefined) data.value.profile.name = p.name.slice(0, 24)
    if (p.avatar) data.value.profile.avatar = p.avatar
    data.value.updated = Date.now()
  }
  function setSettings(s: Partial<Settings>) {
    const cur = data.value.settings
    if (s.goal !== undefined && GOAL_OPTIONS.includes(s.goal)) cur.goal = s.goal
    if (s.cats) cur.cats = s.cats
    if (s.gameCats !== undefined) cur.gameCats = s.gameCats
    data.value.updated = Date.now()
  }

  /* ---------- сохранение и сервер ---------- */
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` })
  const netError = (e: unknown) => ((e as Error).message === 'Failed to fetch' ? 'сервер недоступен' : (e as Error).message)

  async function push() {
    if (!token.value) return
    sync.value = 'syncing'
    try {
      const res = await fetch('/api/progress', { method: 'PUT', headers: headers(), body: JSON.stringify(data.value) })
      if (res.status === 401) return lock('неверный токен')
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      sync.value = 'ok'
      syncMessage.value = 'сохранено на сервере'
    } catch (e) {
      sync.value = 'error'
      syncMessage.value = netError(e)
    }
  }

  /** Проверяет токен и подтягивает прогресс: побеждает более свежая версия. */
  async function init() {
    if (!token.value) return
    sync.value = 'syncing'
    try {
      const res = await fetch('/api/progress', { headers: headers() })
      if (res.status === 401) return lock('неверный токен')
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      verified.value = true
      write(VERIFIED_KEY, '1')
      const remote = normalize(await res.json())
      if (remote && remote.updated > data.value.updated) {
        applying = true
        data.value = remote
        applying = false
        sync.value = 'ok'
        syncMessage.value = 'загружено с сервера'
      } else if (data.value.updated > (remote?.updated ?? 0)) {
        await push()
      } else {
        sync.value = 'ok'
        syncMessage.value = 'сервер подключён'
      }
    } catch (e) {
      // сервер временно недоступен: уже подтверждённый вход не сбрасываем
      sync.value = 'error'
      syncMessage.value = netError(e)
    }
  }

  /** Вход по токену. Возвращает true, если сервер принял токен. */
  async function connect(t: string) {
    const value = t.trim()
    if (!value) return false
    token.value = value
    verified.value = false
    write(TOKEN_KEY, value)
    await init()
    return unlocked.value
  }

  function disconnect() {
    lock('')
  }

  watch(
    data,
    () => {
      write(KEY, JSON.stringify(data.value))
      if (applying || !token.value) return
      clearTimeout(timer)
      timer = setTimeout(push, 1500)
    },
    { deep: true },
  )

  /* ---------- копия и сброс ---------- */
  const exportJson = () => JSON.stringify(data.value, null, 2)

  function importJson(text: string): boolean {
    try {
      const d = normalize(JSON.parse(text))
      if (!d) return false
      d.updated = Date.now()
      data.value = d
      return true
    } catch {
      return false
    }
  }

  function reset() {
    const keep = data.value
    data.value = { ...empty(), profile: keep.profile, settings: keep.settings, updated: Date.now() }
  }

  return {
    data, goal, info, todayOk, goalDone, streak, bestStreak, status, record, importXp, setProfile, setSettings,
    token, unlocked, sync, syncMessage, init, push, connect, disconnect, exportJson, importJson, reset,
  }
})
