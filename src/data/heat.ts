import { dayKey } from '@/stores/progress'

export interface HeatCell {
  key: string
  /** верных ответов в этот день; null — в этот день ответов не было */
  n: number | null
  future: boolean
  /** 0 — нет записи, 1 — ответы были, но верных нет, 2 — до 10 верных, 3 — не дошёл до цели, 4 — цель выполнена */
  level: 0 | 1 | 2 | 3 | 4
}

export const heatLevel = (n: number | null, goal: number): HeatCell['level'] => (n === null ? 0 : n === 0 ? 1 : n < 10 ? 2 : n < goal ? 3 : 4)

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/**
 * Календарь тепла: `weeks` недель, последняя — текущая (неделя с понедельника). Клетки идут по колонкам: колонка — неделя, строка — день недели.
 * `months` — подписи месяцев над колонкой, в которой месяц начался.
 */
export function heatWeeks(days: Record<string, number>, goal: number, weeks = 26, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(end)
  start.setDate(start.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7)
  const cells: HeatCell[] = []
  const months: { col: number; label: string }[] = []
  let lastMonth = -1
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = dayKey(d)
    const n = days[key] ?? null
    cells.push({ key, n, future: d > end, level: heatLevel(n, goal) })
    if (i % 7 === 0) {
      const m = d.getMonth()
      if (m !== lastMonth) {
        months.push({ col: i / 7, label: MONTHS[m]! })
        lastMonth = m
      }
    }
  }
  return { cells, months }
}
