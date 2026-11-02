import { dueWords } from '../review'
import type { ProgressData } from '@/stores/progress'
import { G } from './grammar'
import { ruleTasks } from './rule-tasks'
import { makeTask, randomTasks, shuffle, type Task } from './tasks'

export const QUICK_SIZE = 10
/** Сколько заданий отдать слабым словам, сколько правилу дня; остальное случайные. */
const WEAK = 4
const RULE = 2

/**
 * Режим «5 минут»: десять заданий вперемешку без выбора. Сначала слова, которые пора повторить (с ошибками и давно не повторявшиеся),
 * потом задания на случайное правило, остальное случайные задания. Слабых слов мало или нет: добираются случайными.
 * Номера заданий пересчитываются подряд: у заданий на правило они начинаются с 1000.
 */
export function quickTasks(p: ProgressData, n = QUICK_SIZE, now = Date.now()): Task[] {
  const out: Task[] = []
  const seen = new Set<string>()
  const add = (t: Task | null | undefined) => {
    if (!t || out.length >= n) return
    const key = t.kind + '|' + t.prompt
    if (seen.has(key)) return
    seen.add(key)
    out.push(t)
  }

  for (const d of dueWords(p, now).slice(0, WEAK)) {
    const kinds = shuffle(['tr', 'back', 'read'] as const)
    for (const k of kinds) {
      const t = makeTask(k, d.word, 0)
      if (t) {
        add(t)
        break
      }
    }
  }

  // у части правил заданий нет: берём первое случайное правило, для которого они есть
  for (const g of shuffle(G.filter(g => g.st === 'ok'))) {
    const list = ruleTasks(g, RULE)
    if (list.length) {
      list.forEach(add)
      break
    }
  }

  for (const t of randomTasks(n * 2, p.settings.cats)) add(t)

  return shuffle(out).map((t, i) => ({ ...t, id: i }))
}
