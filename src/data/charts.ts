import { CATN, D } from '@/data/korean/words'
import { intervalDays } from '@/data/review'
import { KNOWN_STREAK, dayKey, type ProgressData } from '@/stores/progress'

const DAY = 86_400_000
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

export interface Point {
  key: string
  /** подпись под столбиком или точкой */
  label: string
  value: number
}

/** Последние n дней по возрастанию (последний — сегодня). */
function lastDays(n: number, now: Date) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i))
    return { key: dayKey(d), label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`, wd: WD[d.getDay()]! }
  })
}

/** Ответы по дням: всего и верных. */
export function answersByDay(p: ProgressData, n = 30, now = new Date()) {
  return lastDays(n, now).map(d => ({ key: d.key, label: d.label, all: p.all[d.key] ?? 0, ok: p.days[d.key] ?? 0 }))
}

/** Минуты занятий по таймеру по дням; сегодняшнее значение можно подменить живым (todaySeconds). */
export function minutesByDay(p: ProgressData, n = 14, now = new Date(), todaySeconds?: number): Point[] {
  const today = dayKey(now)
  return lastDays(n, now).map(d => ({ key: d.key, label: d.label, value: Math.round(((d.key === today && todaySeconds !== undefined ? todaySeconds : p.time[d.key]) ?? 0) / 60) }))
}

/** Доля выученных слов по темам словаря (0…1). Слова без ответов считаются невыученными. */
export function topicShares(p: ProgressData) {
  return Object.entries(CATN).map(([id, name]) => {
    const list = D.filter(d => d.c.includes(id))
    const known = list.filter(d => (p.words[d.k]?.streak ?? 0) >= KNOWN_STREAK).length
    return { id, name, known, total: list.length, share: list.length ? known / list.length : 0 }
  })
}

/** Сколько слов подойдёт к повторению в каждый из ближайших n дней; просроченные идут в «сегодня». */
export function reviewForecast(p: ProgressData, n = 7, now = new Date()): Point[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const counts = new Array<number>(n).fill(0)
  const words = new Set(D.map(d => d.k))
  for (const [k, s] of Object.entries(p.words)) {
    if (!words.has(k) || s.ok + s.bad === 0) continue
    const due = s.last + intervalDays(s.streak) * DAY
    const i = Math.max(0, Math.floor((due - start) / DAY))
    if (i < n) counts[i]!++
  }
  return counts.map((value, i) => {
    const d = new Date(start + i * DAY + DAY / 2)
    return { key: dayKey(d), label: i === 0 ? 'сегодня' : `${WD[d.getDay()]!} ${d.getDate()}`, value }
  })
}
