import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { DAILY_GOAL, levelInfo, levelOf } from '@/data/levels'

export interface WordStat {
  ok: number
  bad: number
  /** верных ответов подряд */
  streak: number
  last: number
}

export interface ProgressData {
  v: 1
  updated: number
  xp: number
  /** дата → число верных ответов за день (ключ есть, если в этот день отвечала хоть раз) */
  days: Record<string, number>
  words: Record<string, WordStat>
  sources: Record<string, { ok: number; bad: number }>
}

export type WordStatus = 'new' | 'learning' | 'known'
export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error'

const KEY = 'progress_v1'
const TOKEN_KEY = 'progress_token'
/** Слово считается выученным после трёх верных ответов подряд. */
export const KNOWN_STREAK = 3

const empty = (): ProgressData => ({ v: 1, updated: 0, xp: 0, days: {}, words: {}, sources: {} })

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Приводит данные из файла или с сервера к безопасному виду. */
function normalize(raw: unknown): ProgressData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<ProgressData>
  if (r.v !== 1) return null
  return {
    v: 1,
    updated: Number(r.updated) || 0,
    xp: Number(r.xp) || 0,
    days: r.days && typeof r.days === 'object' ? r.days : {},
    words: r.words && typeof r.words === 'object' ? r.words : {},
    sources: r.sources && typeof r.sources === 'object' ? r.sources : {},
  }
}

function load(): ProgressData {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) || 'null')) ?? empty()
  } catch {
    return empty()
  }
}

export const useProgressStore = defineStore('progress', () => {
  const data = ref<ProgressData>(load())
  const token = ref('')
  const sync = ref<SyncState>('off')
  const syncMessage = ref('')
  let applying = false
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    token.value = localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    /* без сервера */
  }
  if (token.value) sync.value = 'idle'

  /* ---------- вычисляемое ---------- */
  const info = computed(() => levelInfo(data.value.xp))
  const todayOk = computed(() => data.value.days[dayKey()] ?? 0)
  const goalDone = computed(() => todayOk.value >= DAILY_GOAL)

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

    if (o.word) {
      const w = (d.words[o.word] ??= { ok: 0, bad: 0, streak: 0, last: 0 })
      if (o.ok) {
        w.ok++
        w.streak++
      } else {
        w.bad++
        w.streak = 0
      }
      w.last = Date.now()
    }

    const k = dayKey()
    d.days[k] ??= 0
    let goalReached = false
    if (o.ok) {
      d.xp += o.xp ?? 10
      d.days[k]!++
      goalReached = d.days[k] === DAILY_GOAL
    }
    d.updated = Date.now()
    const level = levelOf(d.xp)
    return { level, levelUp: level > before, goalReached, title: levelInfo(d.xp).title }
  }

  /** Один раз переносит очки старой версии игры. */
  function importXp(xp: number) {
    if (xp > data.value.xp) {
      data.value.xp = xp
      data.value.updated = Date.now()
    }
  }

  /* ---------- сохранение и сервер ---------- */
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` })

  async function push() {
    if (!token.value) return
    sync.value = 'syncing'
    try {
      const res = await fetch('/api/progress', { method: 'PUT', headers: headers(), body: JSON.stringify(data.value) })
      if (res.status === 401) throw new Error('неверный токен')
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      sync.value = 'ok'
      syncMessage.value = 'сохранено на сервере'
    } catch (e) {
      sync.value = 'error'
      syncMessage.value = (e as Error).message === 'Failed to fetch' ? 'сервер недоступен' : (e as Error).message
    }
  }

  /** Подтягивает прогресс с сервера: побеждает более свежая версия. */
  async function init() {
    if (!token.value) return
    sync.value = 'syncing'
    try {
      const res = await fetch('/api/progress', { headers: headers() })
      if (res.status === 401) throw new Error('неверный токен')
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
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
      sync.value = 'error'
      syncMessage.value = (e as Error).message === 'Failed to fetch' ? 'сервер недоступен' : (e as Error).message
    }
  }

  async function connect(t: string) {
    token.value = t.trim()
    try {
      localStorage.setItem(TOKEN_KEY, token.value)
    } catch {
      /* без запоминания токена */
    }
    sync.value = token.value ? 'idle' : 'off'
    await init()
  }

  function disconnect() {
    token.value = ''
    sync.value = 'off'
    syncMessage.value = ''
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ничего */
    }
  }

  watch(
    data,
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data.value))
      } catch {
        /* без сохранения в браузере */
      }
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
    data.value = { ...empty(), updated: Date.now() }
  }

  return {
    data, info, todayOk, goalDone, streak, bestStreak, status, record, importXp,
    token, sync, syncMessage, init, push, connect, disconnect, exportJson, importJson, reset,
  }
})
