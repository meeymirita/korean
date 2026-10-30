/** Сколько секунд считаем на одно задание: если отошёл от экрана, время не раздувается. */
export const PACE_CAP = 120

/** Итог по времени серии: сколько всего, в среднем и какое задание заняло больше всего. */
export interface Pace {
  total: number
  avg: number
  slowest: number
}

/** times — секунды на каждое отвеченное задание по порядку; null, если ответов не было. */
export function paceSummary(times: number[]): Pace | null {
  if (!times.length) return null
  const t = times.map(s => Math.min(Math.max(0, s), PACE_CAP))
  const total = t.reduce((a, b) => a + b, 0)
  return { total: Math.round(total), avg: Math.round((total / t.length) * 10) / 10, slowest: t.indexOf(Math.max(...t)) }
}

/** «1:05» для минут и «7 с» для коротких. */
export function clock(sec: number): string {
  const s = Math.round(sec)
  return s < 60 ? `${s} с` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
