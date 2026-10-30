import { dayKey, type ProgressData } from '@/stores/progress'

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

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
