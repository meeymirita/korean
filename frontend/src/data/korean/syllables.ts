import { shuffle, short } from './tasks'
import { TRANSLATIONS } from './translations'
import { D, type Word } from './words'

export interface SyllableTask {
  word: Word
  /** перевод — подсказка */
  prompt: string
  /** слоги слова по порядку */
  answer: string[]
  /** плитки: слоги слова и один-два лишних, вперемешку */
  tiles: string[]
  /** как показать верный ответ (у фразы с пробелом между словами); у слова нет */
  display?: string
}

/** Подходят слова из 2–4 слогов хангылем, без пробелов и знаков. */
export const SYLLABLE_WORDS = D.filter(d => /^[가-힣]{2,4}$/.test(d.k))

/** Уровни по длине слова: 2 слога (308 слов), 3 слога (108), 4 слога (40); «любой» это все вместе. */
export type SyllableLevel = 'any' | 'easy' | 'medium' | 'hard' | 'phrase'
export const SYLLABLE_LEVELS: { id: SyllableLevel; label: string; hint: string; len?: number }[] = [
  { id: 'any', label: 'Любой', hint: 'Слова из 2–4 слогов вперемешку' },
  { id: 'easy', label: 'Простой', hint: 'Слова из 2 слогов', len: 2 },
  { id: 'medium', label: 'Средний', hint: 'Слова из 3 слогов', len: 3 },
  { id: 'hard', label: 'Сложный', hint: 'Слова из 4 слогов', len: 4 },
  { id: 'phrase', label: 'Фраза', hint: 'Короткая фраза из двух слов (4–6 слогов)' },
]
/** Фразы: предложения из переводов, где ровно два слова хангылем, всего 4–6 слогов («학교에 가요» → 학교에가요); номер от 16000, чтобы не путать со словами словаря. */
export const PHRASES: (Word & { display: string })[] = Object.entries(TRANSLATIONS)
  .map(([ko, ru]) => ({ ko: ko.replace(/[.?!]$/, ''), ru }))
  .filter(x => /^[가-힣]+ [가-힣]+$/.test(x.ko) && x.ko.replace(' ', '').length >= 4 && x.ko.replace(' ', '').length <= 6)
  .map((x, i) => ({ n: 16000 + i, k: x.ko.replace(' ', ''), r: '', t: x.ru, s: '', ft: '', fr: '', fs: '', c: [], display: x.ko }))
const wordsOf = (level: SyllableLevel): Word[] => {
  if (level === 'phrase') return PHRASES
  const len = SYLLABLE_LEVELS.find(l => l.id === level)?.len
  return len ? SYLLABLE_WORDS.filter(d => d.k.length === len) : SYLLABLE_WORDS
}

const POOL = [...new Set(SYLLABLE_WORDS.flatMap(d => [...d.k]))]

/** Задание «собери слово по слогам»: плиток на 1–2 больше, чем слогов, лишние берутся из других слов. */
export function syllableTask(word: Word): SyllableTask {
  const answer = [...word.k]
  const extra = shuffle(POOL.filter(s => !answer.includes(s))).slice(0, answer.length >= 3 ? 2 : 1)
  return { word, prompt: short(word.t), answer, tiles: shuffle([...answer, ...extra]), display: (word as { display?: string }).display }
}

/** n заданий на разные слова выбранного уровня; слова с ошибками (если переданы) идут первыми. */
export function syllableTasks(n = 10, weak: string[] = [], level: SyllableLevel = 'any'): SyllableTask[] {
  const words = wordsOf(level)
  const first = shuffle(words.filter(d => weak.includes(d.k)))
  const rest = shuffle(words.filter(d => !weak.includes(d.k)))
  return [...first, ...rest].slice(0, n).map(syllableTask)
}

/** Собранное из выбранных плиток: слова нет, пока слоги не собраны все. */
export const assembled = (picked: string[]) => picked.join('')
export const isCorrect = (t: SyllableTask, picked: string[]) => assembled(picked) === t.word.k
