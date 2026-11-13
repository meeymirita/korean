import { KNOWN_STREAK, type ProgressData } from '@/stores/progress'
import { STUDY } from './study'
import { makeTask, shuffle, type Task } from './tasks'
import { CATN, type Word } from './words'

/** Сколько заданий в одной серии «Добить тему». */
export const DRILL_SIZE = 10

export interface TopicProgress {
  id: string
  name: string
  /** слов в теме (только слова для заданий, `STUDY`) */
  total: number
  /** из них выучено: очки слова не меньше `KNOWN_STREAK` */
  known: number
  /** доля выученных, 0–100 */
  pct: number
}

/** Слова темы для заданий (без «дополнительных»), без повторов. */
export function topicWords(id: string): Word[] {
  const seen = new Set<string>()
  return STUDY.filter(d => d.c.includes(id) && !seen.has(d.k) && !!seen.add(d.k))
}

const isKnown = (p: ProgressData, k: string) => (p.words[k]?.streak ?? 0) >= KNOWN_STREAK

/** Ещё не выученные слова темы: сначала с самыми низкими очками. */
export function unlearnedWords(p: ProgressData, id: string): Word[] {
  return topicWords(id)
    .filter(d => !isKnown(p, d.k))
    .sort((a, b) => (p.words[a.k]?.streak ?? 0) - (p.words[b.k]?.streak ?? 0))
}

/** «Выучено N из M» по каждой теме словаря (порядок как в `CATN`). */
export function topicProgress(p: ProgressData): TopicProgress[] {
  return Object.entries(CATN).map(([id, name]) => {
    const list = topicWords(id)
    const known = list.filter(d => isKnown(p, d.k)).length
    return { id, name, total: list.length, known, pct: list.length ? Math.round((known / list.length) * 100) : 0 }
  })
}

/**
 * Серия «Добить тему»: по одному заданию на не выученные слова темы (не больше `size`, первыми самые слабые из случайных с равными очками).
 * Все выучены: пустой список. Задания те же, что в «5 минутах» (`makeTask`), поэтому очки и ответы идут общим путём `TaskSession`.
 */
export function topicTasks(p: ProgressData, id: string, size = DRILL_SIZE): Task[] {
  const list = unlearnedWords(p, id)
  const byStreak = new Map<number, Word[]>()
  for (const d of list) {
    const s = p.words[d.k]?.streak ?? 0
    byStreak.set(s, [...(byStreak.get(s) ?? []), d])
  }
  const ordered = [...byStreak.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, ws]) => shuffle(ws))
  const out: Task[] = []
  for (const d of ordered.slice(0, Math.max(1, size))) {
    for (const kind of shuffle(['tr', 'back', 'read', 'blank'] as const)) {
      const t = makeTask(kind, d, out.length)
      if (t) {
        out.push(t)
        break
      }
    }
  }
  return shuffle(out).map((t, i) => ({ ...t, id: i }))
}
