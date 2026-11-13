import { mondayOf } from '@/data/weeks'
import { dayKey, type ProgressData } from '@/stores/progress'
import { validWeekDays, validWeekOk, WEEK_DAYS_DEFAULT, WEEK_OK_DEFAULT } from '@/data/levels'

/** Недельная цель: чистый подсчёт. Парная копия на сервере: backend/src/study/week-goal.ts (тест tests/weekgoal.test.mjs). */
export interface WeekGoal {
  /** понедельник, ГГГГ-ММ-ДД */
  start: string
  /** дней с ответами с понедельника */
  days: number
  /** верных ответов с понедельника */
  ok: number
  goalDays: number
  goalOk: number
  /** оба числа достигнуты */
  done: boolean
  /** общая доля 0–1 для кольца: меньшая из двух долей (кольцо замыкается, когда выполнено всё) */
  ratio: number
}

/** Цель из настроек; нет поля или значение вне границ: 5 дней и 100 верных. */
export function weekGoalSettings(s?: { weekDays?: unknown; weekOk?: unknown } | null): { days: number; ok: number } {
  return { days: validWeekDays(s?.weekDays) ? s.weekDays : WEEK_DAYS_DEFAULT, ok: validWeekOk(s?.weekOk) ? s.weekOk : WEEK_OK_DEFAULT }
}

/** Итог недели (пн–вс, в которую попадает `now`) по прогрессу: день занятий это день с хотя бы одним ответом. */
export function weekGoal(p: Pick<ProgressData, 'all' | 'days' | 'settings'>, now = new Date()): WeekGoal {
  const goal = weekGoalSettings(p.settings)
  const start = mondayOf(now)
  let days = 0
  let ok = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const k = dayKey(d)
    const right = p.days[k] ?? 0
    if ((p.all[k] ?? 0) > 0 || right > 0) days++
    ok += right
  }
  const done = days >= goal.days && ok >= goal.ok
  return { start: dayKey(start), days, ok, goalDays: goal.days, goalOk: goal.ok, done, ratio: Math.min(1, days / goal.days, ok / goal.ok) }
}
