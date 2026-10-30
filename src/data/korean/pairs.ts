import { mistakeWords } from '../mistakes'
import type { ProgressData } from '@/stores/progress'
import { shuffle, short, type Task } from './tasks'
import { D, similarWords, type Word } from './words'

const TITLE = 'Не перепутай'

/** Задание на слово, где «неправильные» варианты похожи на верное (из той же темы, с общими слогами или словами перевода). null — похожих мало. */
export function pairTask(w: Word, id: number, reverse = Math.random() < 0.5): Task | null {
  const seen = new Set([short(w.t), w.k])
  const wrong = similarWords(w, 10)
    .filter(x => !seen.has(short(x.t)) && !seen.has(x.k) && (seen.add(short(x.t)), seen.add(x.k), true))
    .slice(0, 3)
  if (wrong.length < 2) return null
  if (reverse) {
    const options = shuffle([short(w.t), ...wrong.map(x => short(x.t))])
    return { id, kind: 'tr', title: TITLE, prompt: w.k, hint: w.r, options, answer: short(w.t), word: w.k }
  }
  const options = shuffle([w.k, ...wrong.map(x => x.k)])
  return { id, kind: 'back', title: TITLE, prompt: short(w.t), options, answer: w.k, word: w.k }
}

/**
 * Набор «похожие, но разные»: сначала слова, в которых были ошибки (их и путаешь), потом случайные, пока не наберётся n.
 * Номера заданий подряд; на одно слово одно задание.
 */
export function pairTasks(p: ProgressData, n = 10): Task[] {
  const weak = mistakeWords(p, 30).map(m => m.word)
  const rest = shuffle(D.filter(d => !weak.includes(d)))
  const out: Task[] = []
  for (const w of [...shuffle(weak), ...rest]) {
    if (out.length >= n) break
    const t = pairTask(w, out.length)
    if (t) out.push(t)
  }
  return out
}
