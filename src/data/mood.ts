import { dayKey } from '@/stores/progress'

export type Mood = 'easy' | 'ok' | 'hard'
export const MOODS: { id: Mood; label: string; icon: string }[] = [
  { id: 'easy', label: 'Легко', icon: '😌' },
  { id: 'ok', label: 'Нормально', icon: '🙂' },
  { id: 'hard', label: 'Тяжело', icon: '😓' },
]

/** Оценка дня: 1 — легко, 2 — нормально, 3 — тяжело (среднее по отметкам дня); null — отметок не было. */
export function dayScore(row: number[] | undefined): number | null {
  const [e = 0, o = 0, h = 0] = row ?? []
  const n = e + o + h
  return n ? (e + 2 * o + 3 * h) / n : null
}

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const WD_IN = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу']

export interface MoodSummary {
  /** отметок всего */
  total: number
  counts: [number, number, number]
  /** последние 14 дней по возрастанию */
  recent: { key: string; score: number | null }[]
  /** день недели, в который чаще всего тяжело («в среду»); null — данных мало (меньше трёх дней с отметками на день недели) или везде одинаково */
  hardest: string | null
  hardestWeekday: string | null
}

/** Сводка настроения по всей истории: сколько отметок, как шли последние дни и в какой день недели тяжелее всего. */
export function moodSummary(moods: Record<string, number[]>, now = new Date()): MoodSummary {
  const counts: [number, number, number] = [0, 0, 0]
  const byWd: { sum: number; n: number }[] = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }))
  for (const [k, row] of Object.entries(moods)) {
    for (let i = 0; i < 3; i++) counts[i]! += row[i] ?? 0
    const s = dayScore(row)
    if (s !== null) {
      const wd = new Date(k + 'T12:00:00').getDay()
      byWd[wd]!.sum += s
      byWd[wd]!.n++
    }
  }
  const recent = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i))
    const key = dayKey(d)
    return { key, score: dayScore(moods[key]) }
  })
  let hardestIdx = -1
  let best = 0
  const avgs = byWd.map(w => (w.n >= 3 ? w.sum / w.n : null))
  avgs.forEach((a, i) => {
    if (a !== null && a > best) {
      best = a
      hardestIdx = i
    }
  })
  const known = avgs.filter((a): a is number => a !== null)
  const spread = known.length ? Math.max(...known) - Math.min(...known) : 0
  const ok = hardestIdx >= 0 && known.length >= 2 && spread >= 0.3
  return { total: counts[0] + counts[1] + counts[2], counts, recent, hardest: ok ? WD_IN[hardestIdx]! : null, hardestWeekday: ok ? WD[hardestIdx]! : null }
}
