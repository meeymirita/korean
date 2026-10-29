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
