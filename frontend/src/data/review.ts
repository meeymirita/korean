import { D, type Word } from '@/data/korean/words'
import { dayKey, KNOWN_STREAK, type ProgressData, type WordStat } from '@/stores/progress'

const DAY = 86_400_000

/** Через сколько дней слово пора повторить, в зависимости от числа верных ответов подряд. */
const INTERVALS = [0, 1, 3, 7, 14, 30]
export const intervalDays = (streak: number) => INTERVALS[Math.min(streak, INTERVALS.length - 1)]!

export interface DueWord {
  word: Word
  stat: WordStat
  /** во сколько раз просрочено повторение */
  overdue: number
  /** wrong — ошибалась и ещё не выучила; old — давно не повторяла */
  reason: 'wrong' | 'old'
}

/** Слова, которые пора повторить: сначала те, в которых ошибалась, потом самые просроченные. */
export function dueWords(p: ProgressData, now = Date.now()): DueWord[] {
  const byK = new Map(D.map(d => [d.k, d]))
  const out: DueWord[] = []
  for (const [k, stat] of Object.entries(p.words)) {
    const word = byK.get(k)
    if (!word || stat.ok + stat.bad === 0) continue
    const wait = intervalDays(stat.streak) * DAY
    const age = now - stat.last
    if (age < wait) continue
    out.push({
      word,
      stat,
      overdue: wait ? age / wait : 1 + age / DAY,
      reason: stat.streak < KNOWN_STREAK && stat.bad > 0 ? 'wrong' : 'old',
    })
  }
  return out.sort((a, b) => Number(b.reason === 'wrong') - Number(a.reason === 'wrong') || b.overdue - a.overdue)
}

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export interface WeekDay {
  key: string
  label: string
  all: number
  ok: number
}

export interface WeekSummary {
  days: WeekDay[]
  total: number
  ok: number
  accuracy: number | null
  activeDays: number
  bestDay: WeekDay | null
  /** слова, ставшие выученными за эти 7 дней */
  learned: { k: string; t: number }[]
}

/** Итог последних 7 дней, включая сегодняшний. */
export function weekSummary(p: ProgressData, now = new Date()): WeekSummary {
  const days: WeekDay[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = dayKey(d)
    days.push({ key, label: WD[d.getDay()]!, all: p.all[key] ?? 0, ok: p.days[key] ?? 0 })
  }
  const total = days.reduce((n, d) => n + d.all, 0)
  const ok = days.reduce((n, d) => n + d.ok, 0)
  const since = now.getTime() - 7 * DAY
  const learned = Object.entries(p.words)
    .filter(([, w]) => w.kd && w.kd >= since)
    .map(([k, w]) => ({ k, t: w.kd! }))
    .sort((a, b) => b.t - a.t)
  const best = [...days].sort((a, b) => b.ok - a.ok)[0]!
  return {
    days,
    total,
    ok,
    accuracy: total ? Math.round((ok / total) * 100) : null,
    activeDays: days.filter(d => d.all > 0 || d.ok > 0).length,
    bestDay: best.ok > 0 ? best : null,
    learned,
  }
}

/* ---------- раунд «Повторения» (карточки «Помню / Не помню») ---------- */

/** Пометка в журнале у первого ответа по новому слову: по ней считается, сколько новых слов уже было сегодня. */
export const NEW_NOTE = 'новое слово'

export interface SessionCard {
  word: Word
  /** ключ слова в прогрессе; null у предложений и примеров (в очки слов не идут) */
  key: string | null
  /** due — пора повторить; new — ещё не встречалось; extra — закрепление (срок повторения не подошёл или это предложение) */
  kind: 'due' | 'new' | 'extra'
}

const mix = <T>(list: T[], rnd: () => number): T[] => {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Сколько новых слов уже показано сегодня в «Повторении» (по журналу ответов). */
export function newToday(p: ProgressData, now = new Date()): number {
  const day = dayKey(now)
  const seen = new Set<string>()
  for (const e of p.log) {
    if (e.s !== 'review' || e.d?.n !== NEW_NOTE || !e.w) continue
    if (dayKey(new Date(e.t)) === day) seen.add(e.w)
  }
  return seen.size
}

/**
 * Раунд «Повторения» из карточек выбранной группы: первыми слова, которые пора повторить (сначала с ошибками, потом самые просроченные),
 * затем новые (не больше `newLeft`), остаток добирается закреплением: самые слабые из тех, чей срок ещё не подошёл, и предложения.
 */
export function pickSession(cards: Word[], p: ProgressData, o: { size: number; newLeft: number; now?: number; rnd?: () => number }): SessionCard[] {
  const now = o.now ?? Date.now()
  const rnd = o.rnd ?? Math.random
  const due: { word: Word; wrong: boolean; overdue: number }[] = []
  const fresh: Word[] = []
  const rest: { word: Word; stat: WordStat }[] = []
  const loose: Word[] = []
  const taken = new Set<string>()
  for (const word of cards) {
    const id = `${word.n}:${word.k}`
    if (taken.has(id)) continue
    taken.add(id)
    if (word.n >= 13000) {
      loose.push(word)
      continue
    }
    const stat = p.words[word.k]
    if (!stat || stat.ok + stat.bad === 0) {
      fresh.push(word)
      continue
    }
    const wait = intervalDays(stat.streak) * DAY
    const age = now - stat.last
    if (age < wait) rest.push({ word, stat })
    else due.push({ word, wrong: stat.streak < KNOWN_STREAK && stat.bad > 0, overdue: wait ? age / wait : 1 + age / DAY })
  }
  due.sort((a, b) => Number(b.wrong) - Number(a.wrong) || b.overdue - a.overdue)
  rest.sort((a, b) => a.stat.streak - b.stat.streak || a.stat.last - b.stat.last)

  const size = Math.max(1, Math.floor(o.size))
  const key = (w: Word) => (w.n >= 13000 ? null : w.k)
  const out: SessionCard[] = due.slice(0, size).map(d => ({ word: d.word, key: key(d.word), kind: 'due' as const }))
  const news = mix(fresh, rnd).slice(0, Math.max(0, Math.min(Math.floor(o.newLeft), size - out.length)))
  out.push(...news.map(word => ({ word, key: key(word), kind: 'new' as const })))
  const extra = [...rest.map(r => r.word), ...mix(loose, rnd)].slice(0, size - out.length)
  out.push(...extra.map(word => ({ word, key: key(word), kind: 'extra' as const })))
  return out
}
