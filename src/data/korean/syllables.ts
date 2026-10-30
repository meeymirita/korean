import { shuffle, short } from './tasks'
import { D, type Word } from './words'

export interface SyllableTask {
  word: Word
  /** перевод — подсказка */
  prompt: string
  /** слоги слова по порядку */
  answer: string[]
  /** плитки: слоги слова и один-два лишних, вперемешку */
  tiles: string[]
}

/** Подходят слова из 2–4 слогов хангылем, без пробелов и знаков. */
export const SYLLABLE_WORDS = D.filter(d => /^[가-힣]{2,4}$/.test(d.k))

const POOL = [...new Set(SYLLABLE_WORDS.flatMap(d => [...d.k]))]

/** Задание «собери слово по слогам»: плиток на 1–2 больше, чем слогов, лишние берутся из других слов. */
export function syllableTask(word: Word): SyllableTask {
  const answer = [...word.k]
  const extra = shuffle(POOL.filter(s => !answer.includes(s))).slice(0, answer.length >= 3 ? 2 : 1)
  return { word, prompt: short(word.t), answer, tiles: shuffle([...answer, ...extra]) }
}

/** n заданий на разные слова; слова с ошибками (если переданы) идут первыми. */
export function syllableTasks(n = 10, weak: string[] = []): SyllableTask[] {
  const first = shuffle(SYLLABLE_WORDS.filter(d => weak.includes(d.k)))
  const rest = shuffle(SYLLABLE_WORDS.filter(d => !weak.includes(d.k)))
  return [...first, ...rest].slice(0, n).map(syllableTask)
}

/** Собранное из выбранных плиток: слова нет, пока слоги не собраны все. */
export const assembled = (picked: string[]) => picked.join('')
export const isCorrect = (t: SyllableTask, picked: string[]) => assembled(picked) === t.word.k
