import { dayKey, type ProgressData } from '@/stores/progress'

/** Одна календарная неделя (пн–вс) для архива отчётов. */
export interface WeekReport {
  /** понедельник, ГГГГ-ММ-ДД */
  start: string
  /** воскресенье */
  end: string
  total: number
  ok: number
  accuracy: number | null
  activeDays: number
  /** секунды занятий */
  seconds: number
  /** слова, ставшие выученными на этой неделе */
  learned: number
}

const DAY = 86_400_000

/** Понедельник недели, в которую попадает дата. */
export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

/** Последние n завершённых и текущая недели, новые сверху; недели совсем без занятий пропускаются. Данные берутся из прогресса, ничего отдельно не хранится. */
export function weekArchive(p: ProgressData, n = 12, now = new Date()): WeekReport[] {
  const out: WeekReport[] = []
  const cur = mondayOf(now)
  for (let w = 0; w < n; w++) {
    const start = new Date(cur)
    start.setDate(start.getDate() - w * 7)
    let total = 0
    let ok = 0
    let active = 0
    let seconds = 0
    let end = start
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      end = d
      const k = dayKey(d)
      const all = p.all[k] ?? 0
      total += all
      ok += p.days[k] ?? 0
      seconds += p.time[k] ?? 0
      if (all > 0 || (p.days[k] ?? 0) > 0) active++
    }
    if (!total && !seconds) continue
    const from = start.getTime()
    const learned = Object.values(p.words).filter(x => x.kd && x.kd >= from && x.kd < from + 7 * DAY).length
    out.push({ start: dayKey(start), end: dayKey(end), total, ok, accuracy: total ? Math.round((ok / total) * 100) : null, activeDays: active, seconds, learned })
  }
  return out
}

/** «1 ч 05 мин», «20 мин» или «–», если занятий почти не было. */
export function studyTime(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 1) return '–'
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин`
}
