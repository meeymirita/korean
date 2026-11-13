/**
 * Недельная цель владельца (пн–вс): дней занятий и верных ответов. Чистые функции без базы.
 * Парная копия на сайте: frontend/src/data/levels.ts (границы) и frontend/src/data/weekgoal.ts (подсчёт); менять в обоих, тест tests/weekgoal.test.mjs следит.
 */
export const WEEK_DAYS_DEFAULT = 5
export const WEEK_OK_DEFAULT = 100
export const WEEK_DAYS_RANGE = [1, 7] as const
export const WEEK_OK_RANGE = [10, 1000] as const

export const validWeekDays = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= WEEK_DAYS_RANGE[0] && (n as number) <= WEEK_DAYS_RANGE[1]
export const validWeekOk = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= WEEK_OK_RANGE[0] && (n as number) <= WEEK_OK_RANGE[1]

export interface WeekGoalResult {
  /** дней с ответами за неделю с понедельника */
  days: number
  /** верных ответов за неделю с понедельника */
  ok: number
  goalDays: number
  goalOk: number
  /** выполнена, когда достигнуты обе цифры */
  done: boolean
}

/** Цель из сохранённых настроек; нет поля или значение вне границ: 5 дней и 100 верных. */
export function weekGoalOf(settings?: { weekDays?: unknown; weekOk?: unknown } | null): { days: number; ok: number } {
  return { days: validWeekDays(settings?.weekDays) ? settings!.weekDays as number : WEEK_DAYS_DEFAULT, ok: validWeekOk(settings?.weekOk) ? settings!.weekOk as number : WEEK_OK_DEFAULT }
}

/** День недели с понедельником первым: пн 0 ... вс 6, по дате ГГГГ-ММ-ДД. */
const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7

/**
 * Итог недели с понедельника по самый поздний из переданных дней: `rows` это дни за семь последних суток, лишние (до понедельника этой же недели) отбрасываются.
 * День занятий: был хотя бы один ответ.
 */
export function weekGoalResult(rows: { day: string; ok: number; bad: number }[], goal: { days: number; ok: number }): WeekGoalResult {
  const last = rows.length ? rows.map(r => r.day).sort().at(-1)! : ''
  const from = last ? new Date(`${last}T12:00:00`) : null
  if (from) from.setDate(from.getDate() - weekdayIndex(last))
  const start = from ? `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}` : ''
  const week = rows.filter(r => r.day >= start)
  const days = week.filter(r => r.ok + r.bad > 0).length
  const ok = week.reduce((s, r) => s + r.ok, 0)
  return { days, ok, goalDays: goal.days, goalOk: goal.ok, done: days >= goal.days && ok >= goal.ok }
}

/** Строка отчёта «Цель недели: выполнена · 5 из 5 дней, 112 из 100 верных» либо «Цель недели: 3 из 5 дней, 64 из 100 верных». */
export function weekGoalLine(r: WeekGoalResult): string {
  return `Цель недели: ${r.done ? 'выполнена · ' : ''}${r.days} из ${r.goalDays} дней, ${r.ok} из ${r.goalOk} верных`
}
