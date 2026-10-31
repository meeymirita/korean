import { SHORTCUT_IDS } from '@/data/shortcuts'
import { cleanBindings } from '@/lib/shortcuts'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { DAILY_GOAL, GOAL_OPTIONS, levelInfo, levelOf } from '@/data/levels'
import { disableGuestStorage, enableGuestStorage } from '@/lib/guestStorage'
import { errText, fetchT } from '@/lib/http'

export interface WordStat {
  ok: number
  bad: number
  /** верных ответов подряд */
  streak: number
  last: number
  /** когда слово впервые стало выученным */
  kd?: number
}

/** Подробности ответа для истории: что спрашивали, верный ответ, что выбрал. */
export interface AnswerDetail {
  q?: string
  a?: string
  y?: string
}
export interface LogEntry {
  t: number
  w: string | null
  ok: boolean
  s: string
  /** режим (например, build, match) */
  m?: string
  d?: AnswerDetail
}

export interface Profile {
  name: string
  /** эмодзи или картинка data:image/… */
  avatar: string
  /** id картинки из раздела «Картинки» для шапки кабинета; пусто — без обложки */
  cover: string
}

export interface Settings {
  goal: number
  /** темы словаря для «Сегодня» (пусто — все) */
  cats: string[]
  /** группы слов игры (null — как выбрано в самой игре) */
  gameCats: Record<string, number> | null
  /** закладки: «w:слово» и «g:id правила» */
  marks: string[]
  /** свои сочетания клавиш: id пункта меню или вкладки кабинета → «mod+alt+shift+KeyG» */
  keys: Record<string, string>
}

export interface ProgressData {
  v: 1
  updated: number
  xp: number
  /** дата → число верных ответов за день (ключ есть, если в этот день отвечала хоть раз) */
  days: Record<string, number>
  /** дата → все ответы за день */
  all: Record<string, number>
  /** дата → секунды занятий по таймеру */
  time: Record<string, number>
  words: Record<string, WordStat>
  sources: Record<string, { ok: number; bad: number }>
  /** последние ответы, новые первыми */
  log: LogEntry[]
  profile: Profile
  settings: Settings
  /** настроение занятий: дата → [легко, нормально, тяжело] */
  moods: Record<string, number[]>
}

export type WordStatus = 'new' | 'learning' | 'known'
export type SyncState = 'off' | 'idle' | 'syncing' | 'ok' | 'error'
export type Role = 'owner' | 'guest'

/** Действие, которое уходит на сервер (POST /api/ops); сервер раскладывает его по таблицам базы. */
export type Op =
  | { type: 'answer'; t: number; day: string; word: string | null; ok: boolean; source: string; mode?: string; xp: number }
  | { type: 'reset' }
  | { type: 'profile'; name?: string; avatar?: string; cover?: string }
  | { type: 'time'; day: string; seconds: number }
  | { type: 'mood'; day: string; mood: 'easy' | 'ok' | 'hard' }
  | { type: 'settings'; goal?: number; cats?: string[]; gameCats?: Record<string, number> | null; marks?: string[]; keys?: Record<string, string> }
  | { type: 'import'; data: ProgressData }

export interface GuestToken {
  id: string
  label: string
  created: number
  expires: number
}

const KEY = 'progress_v1'
const TOKEN_KEY = 'progress_token'
const VERIFIED_KEY = 'progress_verified'
const SESSION_KEY = 'progress_session'
const ROLE_KEY = 'progress_role'
const OUTBOX_KEY = 'progress_outbox'
/** Через сколько после последнего действия очередь уходит на сервер, и сколько действий за один запрос. */
const FLUSH_DELAY = 800
const BATCH = 200
const LOG_MAX = 300
/** Оставляет только q / a / y, строки не длиннее 300 знаков (так же режет сервер). */
function cleanDetail(d?: AnswerDetail): AnswerDetail | undefined {
  if (!d) return undefined
  const out: AnswerDetail = {}
  for (const k of ['q', 'a', 'y'] as const) if (typeof d[k] === 'string' && d[k]) out[k] = d[k]!.slice(0, 300)
  return Object.keys(out).length ? out : undefined
}
/** Слово считается выученным после трёх верных ответов подряд. */
/** Очков у слова, с которых оно считается выученным: верный ответ +1, ошибка −1 (не ниже 0). */
export const KNOWN_STREAK = 5

const emptyProfile = (): Profile => ({ name: '', avatar: '🌸', cover: '' })
const emptySettings = (): Settings => ({ goal: DAILY_GOAL, cats: [], gameCats: null, marks: [], keys: {} })
export const MAX_MARKS = 500
/** w — слово, g — правило (звёздочка «Важное»), d — урок грамматики отмечен пройденным */
export type MarkKind = 'w' | 'g' | 'd'
export const markKey = (kind: MarkKind, id: string) => `${kind}:${id}`
const empty = (): ProgressData => ({
  v: 1, updated: 0, xp: 0, days: {}, all: {}, time: {}, words: {}, sources: {}, log: [],
  profile: emptyProfile(), settings: emptySettings(), moods: {},
})

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const obj = <T extends object>(v: unknown, fallback: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback)

/** Настроение занятий: только даты и три неотрицательных счётчика. */
function cleanMoods(moods: Record<string, unknown>): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [day, v] of Object.entries(moods)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(v)) continue
    out[day] = [0, 1, 2].map(i => Math.max(0, Math.min(1000, Math.floor(Number(v[i]) || 0))))
  }
  return out
}

/** Из статистики слова остаются только известные числа: лишние поля из чужого файла не попадают в данные. */
function cleanWords(words: Record<string, Partial<WordStat>>): Record<string, WordStat> {
  const out: Record<string, WordStat> = {}
  for (const [k, w] of Object.entries(words)) {
    if (!w || typeof w !== 'object') continue
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)
    out[k] = { ok: n(w.ok), bad: n(w.bad), streak: n(w.streak), last: n(w.last), ...(w.kd ? { kd: n(w.kd) } : {}) }
  }
  return out
}

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
    time: obj(r.time, {}),
    moods: cleanMoods(obj(r.moods, {})),
    words: cleanWords(obj(r.words, {})),
    sources: obj(r.sources, {}),
    log: Array.isArray(r.log) ? r.log.slice(0, LOG_MAX) : [],
    profile: {
      name: typeof profile.name === 'string' ? profile.name.slice(0, 24) : '',
      avatar: typeof profile.avatar === 'string' && profile.avatar ? profile.avatar : '🌸',
      cover: typeof profile.cover === 'string' && /^[a-f0-9]{16}$/.test(profile.cover) ? profile.cover : '',
    },
    settings: {
      goal: GOAL_OPTIONS.includes(Number(settings.goal)) ? Number(settings.goal) : DAILY_GOAL,
      cats: Array.isArray(settings.cats) ? settings.cats.filter(c => typeof c === 'string') : [],
      gameCats: settings.gameCats && typeof settings.gameCats === 'object' ? settings.gameCats : null,
      marks: Array.isArray(settings.marks) ? [...new Set(settings.marks.filter((m): m is string => typeof m === 'string' && /^[wgd]:.{1,40}$/.test(m)))].slice(0, MAX_MARKS) : [],
      keys: cleanBindings(settings.keys, SHORTCUT_IDS),
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

function loadOutbox(): Op[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
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
  /** гость: прогресс только в памяти, на сервер ничего не уходит (см. lib/guestStorage.ts) */
  const role = ref<Role>(read(ROLE_KEY) === 'guest' ? 'guest' : 'owner')
  if (role.value === 'guest') enableGuestStorage()
  const guestExpires = ref(0)
  const isGuest = computed(() => role.value === 'guest')
  let expireTimer: ReturnType<typeof setTimeout> | undefined

  const data = ref<ProgressData>(load())
  const token = ref(read(TOKEN_KEY))
  /** Сеанс двухфакторного входа (выдаётся за код из письма); без включённой защиты пуст. */
  const session = ref(read(SESSION_KEY))
  /** Токен подошёл, но сервер просит ещё код из письма. */
  const needs2fa = ref(false)
  /** Что идёт в заголовке Authorization после «Bearer»: токен, а после двухфакторного входа «токен сеанс». */
  const bearer = computed(() => (session.value ? `${token.value} ${session.value}` : token.value))
  /** токен хотя бы раз подошёл серверу: до этого функции сайта закрыты */
  const verified = ref(read(VERIFIED_KEY) === '1')
  const sync = ref<SyncState>(token.value ? 'idle' : 'off')
  const syncMessage = ref('')
  let applying = false
  /** Очередь неотправленных действий: хранится в браузере, поэтому ничего не теряется без сети и после перезагрузки. */
  const outbox = ref<Op[]>(role.value === 'guest' ? [] : loadOutbox())
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushing = false

  /* ---------- доступ ---------- */
  const unlocked = computed(() => !!token.value && verified.value)

  function lock(message = '') {
    const wasGuest = role.value === 'guest'
    clearTimeout(expireTimer)
    token.value = ''
    session.value = ''
    needs2fa.value = false
    verified.value = false
    role.value = 'owner'
    guestExpires.value = 0
    write(TOKEN_KEY, null)
    write(SESSION_KEY, null)
    write(VERIFIED_KEY, null)
    write(ROLE_KEY, null)
    if (wasGuest) {
      // гостевая память выбрасывается, на экране снова данные этого устройства
      disableGuestStorage()
      applying = true
      data.value = load()
      applying = false
      outbox.value = loadOutbox()
    }
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
  function record(o: { word?: string | null; ok: boolean; source: string; xp?: number; mode?: string; detail?: AnswerDetail }) {
    const now = Date.now()
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
          w.kd = now
          bloomed = true
        }
      } else {
        w.bad++
        w.streak = Math.max(0, w.streak - 1)
      }
      w.last = now
    }

    const k = dayKey()
    d.days[k] ??= 0
    d.all[k] = (d.all[k] ?? 0) + 1
    const det = cleanDetail(o.detail)
    d.log.unshift({ t: now, w: o.word ?? null, ok: o.ok, s: o.source, ...(o.mode ? { m: o.mode } : {}), ...(det ? { d: det } : {}) })
    if (d.log.length > LOG_MAX) d.log.length = LOG_MAX

    let goalReached = false
    if (o.ok) {
      d.xp += o.xp ?? 10
      d.days[k]!++
      goalReached = d.days[k] === goal.value
    }
    d.updated = now
    queue({ type: 'answer', t: now, day: k, word: o.word ?? null, ok: o.ok, source: o.source, mode: o.mode, xp: o.xp ?? 10, ...(det ? { detail: det } : {}) })
    const level = levelOf(d.xp)
    return { level, levelUp: level > before, goalReached, bloomed, title: levelInfo(d.xp).title }
  }

  /** Один раз переносит очки старой версии игры. */
  function importXp(xp: number) {
    // с сервером очки хранятся в базе: перенос старых очков нужен только без входа
    if (xp > data.value.xp && !(token.value && role.value !== 'guest')) {
      data.value.xp = xp
      data.value.updated = Date.now()
    }
  }

  /* ---------- профиль и настройки ---------- */
  function setProfile(p: Partial<Profile>) {
    if (p.name !== undefined) data.value.profile.name = p.name.slice(0, 24)
    if (p.avatar) data.value.profile.avatar = p.avatar
    if (p.cover !== undefined) data.value.profile.cover = p.cover
    data.value.updated = Date.now()
    queue({
      type: 'profile',
      ...(p.name !== undefined ? { name: data.value.profile.name } : {}),
      ...(p.avatar ? { avatar: p.avatar } : {}),
      ...(p.cover !== undefined ? { cover: p.cover } : {}),
    })
  }
  /** Прибавляет секунды занятий к сегодняшнему дню (их считает таймер). */
  function addTime(seconds: number) {
    const sec = Math.floor(seconds)
    if (sec < 1) return
    const k = dayKey()
    data.value.time[k] = (data.value.time[k] ?? 0) + sec
    data.value.updated = Date.now()
    queue({ type: 'time', day: k, seconds: sec })
  }
  function setSettings(s: Partial<Settings>) {
    const cur = data.value.settings
    if (s.goal !== undefined && GOAL_OPTIONS.includes(s.goal)) cur.goal = s.goal
    if (s.cats) cur.cats = s.cats
    if (s.gameCats !== undefined) cur.gameCats = s.gameCats
    if (s.marks) cur.marks = s.marks
    if (s.keys) cur.keys = s.keys
    data.value.updated = Date.now()
    queue({
      type: 'settings',
      ...(s.goal !== undefined && GOAL_OPTIONS.includes(s.goal) ? { goal: s.goal } : {}),
      ...(s.cats ? { cats: s.cats } : {}),
      ...(s.gameCats !== undefined ? { gameCats: s.gameCats } : {}),
      ...(s.marks ? { marks: s.marks } : {}),
      ...(s.keys ? { keys: s.keys } : {}),
    })
  }

  /** Настроение занятия («легко / нормально / тяжело»): прибавляется к счётчикам сегодняшнего дня. */
  function addMood(mood: 'easy' | 'ok' | 'hard') {
    const k = dayKey()
    const row = (data.value.moods[k] ??= [0, 0, 0])
    const i = ['easy', 'ok', 'hard'].indexOf(mood)
    row[i] = Math.min(1000, (row[i] ?? 0) + 1)
    data.value.updated = Date.now()
    queue({ type: 'mood', day: k, mood })
  }

  /** Звёздочка: закладка есть или нет. Гостю закладки не сохраняются (его записи сервер игнорирует). Возвращает false, если лимит закладок исчерпан. */
  const isMarked = (kind: MarkKind, id: string) => data.value.settings.marks.includes(markKey(kind, id))
  function toggleMark(kind: MarkKind, id: string): boolean {
    const key = markKey(kind, id)
    const cur = data.value.settings.marks
    if (cur.includes(key)) setSettings({ marks: cur.filter(m => m !== key) })
    else if (cur.length >= MAX_MARKS) return false
    else setSettings({ marks: [...cur, key] })
    return true
  }

  /* ---------- сохранение и сервер ---------- */
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${bearer.value}` })
  const netError = errText

  /**
   * Сервер ответил 401. «2fa»: токен верный, но защита просит ещё код из письма: доступ закрывается до ввода кода, очередь действий остаётся.
   * Иначе токен чужой или у гостевого токена вышел срок: доступ закрывается с объяснением.
   */
  async function denied(res: Response) {
    let error = ''
    try {
      error = (await res.json()).error
    } catch {
      /* без тела */
    }
    if (error !== '2fa') return lock(error === 'expired' ? 'срок гостевого доступа закончился' : 'неверный токен')
    session.value = ''
    write(SESSION_KEY, null)
    needs2fa.value = true
    verified.value = false
    write(VERIFIED_KEY, null)
    sync.value = 'idle'
    syncMessage.value = ''
  }

  /** Сеанс после верного кода: запоминается в браузере, второй шаг закрыт. */
  function setSession(id: string) {
    session.value = id
    needs2fa.value = false
    write(SESSION_KEY, id)
  }

  /** Ставит действие в очередь; через FLUSH_DELAY после последнего действия очередь уходит на сервер. Гостю и без токена не отправляется. */
  function queue(op: Op) {
    if (!token.value || role.value === 'guest') return
    outbox.value.push(op)
    write(OUTBOX_KEY, JSON.stringify(outbox.value))
    clearTimeout(flushTimer)
    flushTimer = setTimeout(() => void push(), FLUSH_DELAY)
  }

  /** Отправляет очередь пачками. Не удалось (сеть, ошибка сервера) — действия остаются в браузере и уйдут позже. */
  async function push() {
    if (flushing || !token.value || role.value === 'guest' || !outbox.value.length) return
    flushing = true
    clearTimeout(flushTimer)
    let rejected = false
    try {
      sync.value = 'syncing'
      while (outbox.value.length) {
        const batch = outbox.value.slice(0, BATCH)
        const res = await fetchT('/api/ops', { method: 'POST', headers: headers(), body: JSON.stringify({ ops: batch }) })
        if (res.status === 401) return denied(res)
        // 400: сервер не принял пачку; выбрасываем её, чтобы очередь не застряла навсегда
        if (!res.ok && res.status !== 400) throw new Error(`ошибка сервера ${res.status}`)
        outbox.value = outbox.value.slice(batch.length)
        write(OUTBOX_KEY, JSON.stringify(outbox.value))
        if (res.status === 400) rejected = true
      }
      sync.value = rejected ? 'error' : 'ok'
      syncMessage.value = rejected ? 'сервер отклонил часть действий' : 'сохранено на сервере'
    } catch (e) {
      sync.value = 'error'
      syncMessage.value = netError(e)
    } finally {
      flushing = false
    }
  }

  /** Проверяет токен и загружает прогресс: сервер главный. Неотправленные действия сначала уходят на сервер. */
  async function init() {
    if (!token.value) return
    sync.value = 'syncing'
    try {
      let res = await fetchT('/api/progress', { headers: headers() })
      if (res.status === 401) return denied(res)
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      needs2fa.value = false
      verified.value = true
      write(VERIFIED_KEY, '1')
      if (res.headers?.get('X-Role') === 'guest') return enterGuest(Number(res.headers.get('X-Guest-Expires')) || 0)
      if (role.value === 'guest') leaveGuest()
      if (outbox.value.length) {
        await push()
        if (!token.value) return // сервер ответил 401 и доступ закрыт
        if (outbox.value.length) return void (syncMessage.value = 'не всё отправлено: изменения сохранены в браузере')
        res = await fetchT('/api/progress', { headers: headers() })
        if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      }
      const remote = normalize(await res.json())
      if (remote) {
        applying = true
        data.value = remote
        applying = false
      }
      sync.value = 'ok'
      syncMessage.value = 'загружено с сервера'
    } catch (e) {
      // сервер временно недоступен: уже подтверждённый вход не сбрасываем, данные остаются из браузера
      sync.value = 'error'
      syncMessage.value = netError(e)
    }
  }

  /** Гость: чистый прогресс в памяти, ничего не сохраняется и не уходит на сервер; по истечении срока доступ закрывается. */
  function enterGuest(expires: number) {
    if (role.value !== 'guest') {
      enableGuestStorage()
      applying = true
      data.value = empty()
      applying = false
      outbox.value = [] // очередь владельца остаётся в настоящем хранилище и вернётся после выхода гостя
    }
    role.value = 'guest'
    guestExpires.value = expires
    write(ROLE_KEY, 'guest')
    sync.value = 'ok'
    syncMessage.value = 'гостевой доступ: ничего не сохраняется'
    clearTimeout(expireTimer)
    if (expires) expireTimer = setTimeout(() => void init(), Math.min(Math.max(expires - Date.now(), 0) + 500, 2_000_000_000))
  }

  /** Токен владельца подошёл после гостевого: возвращаем настоящее хранилище. */
  function leaveGuest() {
    clearTimeout(expireTimer)
    role.value = 'owner'
    guestExpires.value = 0
    write(ROLE_KEY, null)
    disableGuestStorage()
    applying = true
    data.value = load()
    applying = false
    outbox.value = loadOutbox()
  }

  /** Вход по токену. Возвращает true, если сервер принял токен. */
  async function connect(t: string) {
    const value = t.trim()
    if (!value) return false
    if (value !== token.value) {
      // другой токен (например, гостевой): сеанс прежнего токена к нему не подходит
      session.value = ''
      write(SESSION_KEY, null)
    }
    needs2fa.value = false
    token.value = value
    verified.value = false
    write(TOKEN_KEY, value)
    await init()
    if (unlocked.value) void fetchT('/api/session', { method: 'POST', headers: headers() }).catch(() => undefined) // вход попадает в журнал событий
    return unlocked.value
  }

  function disconnect() {
    lock('')
  }

  watch(
    data,
    () => {
      write(KEY, JSON.stringify(data.value))
    },
    { deep: true },
  )

  /* ---------- гостевые токены (только владелец) ---------- */
  /** Тексты ошибок опасных действий: сервер просит повторный токен (403) или блокирует подбор (429). */
  const confirmError = (status: number) =>
    status === 403 ? 'неверный токен подтверждения' : status === 429 ? 'слишком много попыток, подождите несколько минут' : `ошибка сервера ${status}`

  /** Заголовок не принимает русские буквы: такой токен заведомо неверный, не отправляем. */
  const checkConfirm = (confirm?: string) => {
    if (confirm !== undefined && confirm !== '' && !/^[\x20-\x7e]+$/.test(confirm)) throw new Error(confirmError(403))
  }

  async function guestApi<T>(method: string, url: string, body?: unknown, confirm?: string): Promise<T> {
    checkConfirm(confirm)
    const res = await fetchT(url, {
      method,
      headers: { ...headers(), ...(confirm ? { 'X-Confirm-Token': confirm } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(method === 'POST' ? confirmError(res.status) : res.status === 403 ? 'гостевые токены создаёт только владелец' : `ошибка сервера ${res.status}`)
    return res.json()
  }
  /** Гостевой токен даёт доступ ко всему, поэтому создаётся только с повторным вводом токена владельца. */
  const createGuest = (hours: number, label: string, confirm: string) =>
    guestApi<GuestToken & { token: string }>('POST', '/api/guests', { hours, label }, confirm)
  const listGuests = () => guestApi<GuestToken[]>('GET', '/api/guests')
  const revokeGuest = (id: string) => guestApi<{ ok: true }>('DELETE', `/api/guests/${id}`)

  /* ---------- копия и сброс ---------- */
  const exportJson = () => JSON.stringify(data.value, null, 2)

  /** С сервером опасное действие требует повторного токена и выполняется сразу (без очереди): не удалось — ничего не меняется. */
  const needsConfirm = () => !!token.value && role.value !== 'guest'
  async function destructive(op: Op, confirm: string) {
    checkConfirm(confirm)
    await push() // накопленные действия уходят раньше
    const res = await fetchT('/api/ops', { method: 'POST', headers: { ...headers(), 'X-Confirm-Token': confirm }, body: JSON.stringify({ ops: [op] }) })
    if (res.status === 401) {
      await denied(res)
      throw new Error('нет доступа')
    }
    if (!res.ok) throw new Error(confirmError(res.status))
  }

  async function importJson(text: string, confirm = ''): Promise<boolean> {
    let d: ProgressData | null
    try {
      d = normalize(JSON.parse(text))
    } catch {
      return false
    }
    if (!d) return false
    d.updated = Date.now()
    if (needsConfirm()) await destructive({ type: 'import', data: d }, confirm)
    data.value = d
    return true
  }

  /** Сброс прогресса (профиль и настройки остаются). С сервером нужен повторный токен. */
  async function reset(confirm = '') {
    if (needsConfirm()) await destructive({ type: 'reset' }, confirm)
    const keep = data.value
    data.value = { ...empty(), profile: keep.profile, settings: keep.settings, updated: Date.now() }
  }

  return {
    data, goal, info, todayOk, isMarked, toggleMark, addMood, goalDone, streak, bestStreak, status, record, importXp, setProfile, setSettings, addTime,
    token, bearer, session, needs2fa, setSession, unlocked, sync, syncMessage, init, push, connect, disconnect, exportJson, importJson, reset, needsConfirm,
    role, isGuest, guestExpires, createGuest, listGuests, revokeGuest,
  }
})
