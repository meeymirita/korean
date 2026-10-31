import { ADJECTIVES, QSENT, QWORDS, VERBS, type TWord } from './forms'
import { shuffle, short } from './tasks'
import { D } from './words'

export type { TWord }
export type Direction = 'ko-ru' | 'ru-ko' | 'form' | 'past' | 'fill'

export interface TSet {
  id: string
  title: string
}

export const SETS: TSet[] = [
  { id: 'verbs', title: 'Глаголы' },
  { id: 'adjectives', title: 'Прилагательные' },
  { id: 'qwords', title: 'Вопросительные слова' },
  { id: 'qsent', title: 'Вопросительные предложения' },
]

export const DIR_LABEL: Record<Direction, string> = {
  'ko-ru': 'корейский → русский',
  'ru-ko': 'русский → корейский',
  form: 'настоящее время (-아요/어요)',
  past: 'прошедшее время (-았어요/었어요)',
  fill: 'вставь слово',
}

export const dirsFor = (cat: string): Direction[] =>
  cat === 'qsent' ? ['fill'] : cat === 'verbs' || cat === 'adjectives' ? ['ko-ru', 'ru-ko', 'form', 'past'] : ['ko-ru', 'ru-ko']

const SET_WORDS: Record<string, TWord[]> = { verbs: VERBS, adjectives: ADJECTIVES, qwords: QWORDS, qsent: QSENT }

/** Слова для тренажёров: без скобок и очень длинных переводов. */
export const pool = (cat: string): TWord[] =>
  SET_WORDS[cat] ??
  D.filter(d => (!cat || d.c.includes(cat)) && !/[()]/.test(d.k) && d.k.length <= 12 && d.t.length <= 60)

/** Перевод для показа справа и в вопросах. */
export const shown = (w: TWord) => w.label ?? short(w.t)

/** Раунд из n слов; переводы не повторяются, чтобы пара была однозначной. */
export function pickRound(words: TWord[], n: number): TWord[] {
  const out: TWord[] = []
  const seen = new Set<string>()
  for (const w of shuffle(words)) {
    const key = shown(w).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
    if (out.length >= n) break
  }
  return out
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zа-я0-9가-힣 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Все принятые варианты перевода: «есть / кушать» → «есть», «кушать». */
export const acceptable = (w: TWord) =>
  w.t
    .split(' →')[0]!
    .split(/[,;/]/)
    .map(norm)
    .filter(Boolean)

const squash = (s: string) => s.replace(/\s/g, '')

export function isCorrect(input: string, w: TWord, dir: Direction) {
  if (dir === 'ru-ko') return squash(input) === squash(w.k)
  if (dir === 'form') return squash(input) === squash(w.form ?? '')
  if (dir === 'past') return squash(input) === squash(w.past ?? '')
  if (dir === 'fill') return squash(input) === squash(w.ans ?? '')
  const given = norm(input)
  return !!given && acceptable(w).includes(given)
}

/** Текст правильного ответа для показа. */
export const answerText = (w: TWord, dir: Direction) =>
  dir === 'ru-ko' ? w.k : dir === 'form' ? (w.form ?? '') : dir === 'past' ? (w.past ?? '') : dir === 'fill' ? (w.ans ?? '') : shown(w)

/** Что показываем в вопросе. */
export const promptOf = (w: TWord, dir: Direction) =>
  dir === 'ru-ko' ? shown(w) : dir === 'fill' ? (w.blank ?? w.k) : w.k

/** Подпись над вопросом. */
export const labelOf = (dir: Direction) =>
  ({
    'ko-ru': 'Переведи на русский',
    'ru-ko': 'Напиши по-корейски',
    form: 'Напиши форму: вежливое настоящее время',
    past: 'Напиши форму: прошедшее время',
    fill: 'Вставь пропущенное слово',
  })[dir]

/** Слово для общего прогресса; целые предложения (вопросительные) как слова не считаем. */
export const statKey = (w: TWord): string | null => (w.n >= 13000 ? null : w.k)
