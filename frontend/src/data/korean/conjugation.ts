import { ADJECTIVES, VERBS, type TWord } from './forms'

export interface Conjugation {
  k: string
  r: string
  t: string
  kind: 'verb' | 'adj'
  /** вежливое настоящее */
  present: string
  past: string
  /** отрицание с 안 */
  neg: string
}

/** Глаголы на 하다, где 하다 не отдельное слово: отрицание ставится перед самим глаголом («안 좋아해요»), а не после существительного. */
const WHOLE = new Set(['좋아하다', '싫어하다'])

/** Отрицание с «안»: 가다 → 안 가요; существительное + 하다 → существительное + 안 해요 (공부하다 → 공부 안 해요). */
export function negate(k: string, present: string): string {
  if (k.endsWith('하다') && k.length > 2 && !WHOLE.has(k)) return `${k.slice(0, -2)} 안 해요`
  return `안 ${present}`
}

const conj = (w: TWord, kind: Conjugation['kind']): Conjugation | null =>
  w.form && w.past ? { k: w.k, r: w.r, t: w.t, kind, present: w.form, past: w.past, neg: negate(w.k, w.form) } : null

/** Все глаголы и прилагательные с тремя формами. */
export const CONJUGATIONS: Conjugation[] = [
  ...VERBS.map(w => conj(w, 'verb')),
  ...ADJECTIVES.map(w => conj(w, 'adj')),
].filter((c): c is Conjugation => !!c)
