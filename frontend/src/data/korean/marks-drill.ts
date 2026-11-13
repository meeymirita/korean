import type { ProgressData } from '@/stores/progress'
import { STUDY } from './study'
import type { Task } from './tasks'
import { drillTasks } from './topics'
import { D, type Word } from './words'

/** Сколько заданий в серии по отмеченным словам. */
export const MARKS_DRILL_SIZE = 15
/** Меньше отмеченных слов серию не запускаем (решение владельца, 2026-11-13). */
export const MARKS_DRILL_MIN = 4

export interface MarksDrill {
  /** Слова со звёздочкой, которые есть в STUDY (из них собирается серия). */
  usable: Word[]
  /** Слова со звёздочкой, которые есть в словаре, но вне STUDY (в задания не идут). */
  skipped: number
}

/** Слова со звёздочкой (`w:<слово>` в `settings.marks`): годные для заданий и пропущенные. Слов, которых нет в словаре, не считаем. */
export function markedWords(p: ProgressData): MarksDrill {
  const study = new Set(STUDY.map(d => d.k))
  const usable: Word[] = []
  let skipped = 0
  for (const m of p.settings.marks) {
    if (!m.startsWith('w:')) continue
    const k = m.slice(2)
    const d = D.find(x => x.k === k)
    if (!d) continue
    if (study.has(k)) usable.push(d)
    else skipped++
  }
  return { usable, skipped }
}

/**
 * Серия «Потренировать важные слова»: по одному заданию на слово со звёздочкой, первыми слова с низкими очками (с равными очками случайно).
 * Подбор общий с «Добить тему» (`drillTasks` в `topics.ts`). Меньше `MARKS_DRILL_MIN` годных слов: пустой список.
 */
export function marksTasks(p: ProgressData, size = MARKS_DRILL_SIZE): Task[] {
  const { usable } = markedWords(p)
  if (usable.length < MARKS_DRILL_MIN) return []
  return drillTasks(p, usable, size)
}
