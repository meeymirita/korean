import { TRANSLATIONS } from './translations'
import { shuffle, type Task } from './tasks'

export type TranslateDir = 'ko-ru' | 'ru-ko' | 'mix'
export const TRANSLATE_DIRS: { id: TranslateDir; label: string }[] = [
  { id: 'ko-ru', label: 'Корейский → русский' },
  { id: 'ru-ko', label: 'Русский → корейский' },
  { id: 'mix', label: 'Вперемешку' },
]

const PAIRS = Object.entries(TRANSLATIONS).filter(([ko, ru]) => ko && ru)

/** Неверные варианты: предложения похожей длины (чтобы ответ не угадывался по размеру), без повторов и без самого ответа. */
function distractors(idx: number, side: 0 | 1, count = 3): string[] {
  const answer = PAIRS[idx]![side]
  const sample = shuffle(PAIRS.map((_, i) => i).filter(i => i !== idx)).slice(0, 40)
  const seen = new Set([answer])
  return sample
    .map(i => PAIRS[i]![side])
    .filter(s => !seen.has(s) && (seen.add(s), true))
    .sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length))
    .slice(0, count)
}

/** Набор «переведи предложение целиком» в одну или обе стороны. Номера заданий подряд. */
export function translateTasks(dir: TranslateDir = 'mix', n = 10): Task[] {
  const out: Task[] = []
  for (const idx of shuffle(PAIRS.map((_, i) => i))) {
    if (out.length >= n) break
    const toRu = dir === 'ko-ru' || (dir === 'mix' && Math.random() < 0.5)
    const [ko, ru] = PAIRS[idx]!
    const wrong = distractors(idx, toRu ? 1 : 0)
    if (wrong.length < 3) continue
    const answer = toRu ? ru : ko
    out.push({
      id: out.length,
      kind: toRu ? 'tr' : 'back',
      title: toRu ? 'Переведи на русский' : 'Переведи на корейский',
      prompt: toRu ? ko : ru,
      options: shuffle([answer, ...wrong]),
      answer,
    })
  }
  return out
}
