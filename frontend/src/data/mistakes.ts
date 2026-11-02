import { KNOWN_STREAK, type ProgressData, type WordStat } from '@/stores/progress'
import { D, type Word } from './korean/words'
import { makeTask, shuffle, type Task } from './korean/tasks'

export interface MistakeWord {
  word: Word
  stat: WordStat
  /** доля неверных ответов, 0–1 */
  rate: number
  /** слово уже выучено (набрано 5 очков), но раньше с ним были ошибки */
  learned: boolean
}

/**
 * Слова, в которых были ошибки: сначала где ошибок больше всего, при равенстве где выше доля неверных.
 * Слова без ошибок и чужие ключи (не из словаря) не попадают.
 */
export function mistakeWords(p: ProgressData, limit = Infinity): MistakeWord[] {
  const byK = new Map(D.map(d => [d.k, d]))
  const out: MistakeWord[] = []
  for (const [k, stat] of Object.entries(p.words)) {
    const word = byK.get(k)
    if (!word || stat.bad <= 0) continue
    out.push({ word, stat, rate: stat.bad / (stat.ok + stat.bad), learned: stat.streak >= KNOWN_STREAK })
  }
  return out.sort((a, b) => b.stat.bad - a.stat.bad || b.rate - a.rate || a.word.n - b.word.n).slice(0, limit)
}

/** Быстрая тренировка только по ошибочным словам: по одному заданию на слово, типы чередуются. */
export function mistakeTasks(p: ProgressData, n = 10, pool = 30): Task[] {
  const words = shuffle(mistakeWords(p, pool).map(m => m.word)).slice(0, n)
  const out: Task[] = []
  for (const w of words) {
    for (const kind of shuffle(['tr', 'back', 'read', 'blank'] as const)) {
      const t = makeTask(kind, w, out.length)
      if (t) {
        out.push(t)
        break
      }
    }
  }
  return out
}
