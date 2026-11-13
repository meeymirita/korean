import { dayKey, type ProgressData } from '@/stores/progress'

export interface Record1 {
  /** день (ГГГГ-ММ-ДД); у недели — её понедельник */
  key: string
  n: number
}

export interface PersonalRecords {
  bestDay: Record1 | null
  bestWeek: Record1 | null
  /** дольше всего занимался за день (секунды) */
  bestTime: Record1 | null
  /** сегодняшний день сравнялся с лучшим или побил его (и верных ответов больше нуля) */
  todayIsBest: boolean
}

const parse = (k: string) => new Date(k + 'T12:00:00')
const mondayOf = (k: string) => {
  const d = parse(k)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(d)
}

/** Максимум по словарю «ключ → число»; при равенстве берётся более ранний день. */
function maxOf(map: Record<string, number>): Record1 | null {
  let best: Record1 | null = null
  for (const [key, n] of Object.entries(map)) if (n > 0 && (!best || n > best.n || (n === best.n && key < best.key))) best = { key, n }
  return best
}

/** Личные рекорды: лучший день и неделя по верным ответам, самое долгое занятие. */
export function personalRecords(p: ProgressData, now = new Date()): PersonalRecords {
  const weeks: Record<string, number> = {}
  for (const [k, n] of Object.entries(p.days)) weeks[mondayOf(k)] = (weeks[mondayOf(k)] ?? 0) + n
  const bestDay = maxOf(p.days)
  const today = p.days[dayKey(now)] ?? 0
  return {
    bestDay,
    bestWeek: maxOf(weeks),
    bestTime: maxOf(p.time),
    todayIsBest: today > 0 && !!bestDay && today >= bestDay.n,
  }
}
