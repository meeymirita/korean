import { D as GAME } from '@/game/words'
import type { Word } from './words'

/** Слово для тренажёра; доп. поля нужны глаголам, прилагательным и вопросам. */
export interface TWord extends Word {
  /** вежливая форма настоящего времени: 가다 → 가요 */
  form?: string
  /** форма прошедшего времени: 가다 → 갔어요 */
  past?: string
  /** предложение с пропуском: «카페가 ___예요?» */
  blank?: string
  /** пропущенное слово */
  ans?: string
  /** перевод для показа, если «короткий» вариант неоднозначен */
  label?: string
}

export const mk = (n: number, k: string, r: string, t: string, extra: Partial<TWord> = {}): TWord => ({
  n,
  k,
  r,
  t,
  s: '',
  ft: '',
  fr: '',
  fs: '',
  c: [],
  ...extra,
})

/** [слово, чтение, перевод, настоящее, прошедшее, пояснение] → слово тренажёра. */
const forms = (rows: any[][], base: number) =>
  rows.map((e, i) => mk(base + i, e[0], e[1], e[2], { form: e[3], past: e[4], s: e[5] ?? '' }))

export const VERBS = forms(GAME.V!, 10000)
export const ADJECTIVES = forms(GAME.A!, 11000)
export const QWORDS = GAME.Q!.map((e, i) => mk(12000 + i, e[0], e[1], e[2], { label: e[2] }))
export const QSENT = GAME.QB!.map((e, i) =>
  mk(13000 + i, e[0].replace('___', e[2]), '', e[1], { blank: e[0], ans: e[2], label: e[1] }),
)
