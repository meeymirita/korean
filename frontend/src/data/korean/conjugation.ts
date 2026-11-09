import { ADJECTIVES, VERBS, type TWord } from './forms'

export interface Conjugation {
  /** будущее с -(으)ㄹ 거예요: только у глаголов, где форма правильная (`futureForm`) */
  future?: string
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

/** Глаголы, у которых перед ㄹ / 을 меняется основа (ㄷ, ㅂ): их будущее пока не показываем, чтобы не научить неправильной форме. */
const FUTURE_IRREGULAR = new Set(['듣다', '걷다', '묻다', '돕다', '눕다', '굽다', '짓다', '낫다', '붓다', '긋다'])

/**
 * Будущее с -(으)ㄹ 거예요: основа без ㄷ / ㅂ-изменений + ㄹ после гласной (가 → 갈), + 을 после 받침 (먹 → 먹을), основа на ㄹ без добавки (살 → 살).
 * Возвращает null для не-глаголов и для глаголов с изменением основы.
 */
export function futureForm(k: string): string | null {
  if (!k.endsWith('다') || k.length < 2 || FUTURE_IRREGULAR.has(k)) return null
  const stem = k.slice(0, -1)
  const code = stem.charCodeAt(stem.length - 1) - 0xac00
  if (code < 0 || code > 11171) return null
  const jong = code % 28
  if (jong === 8) return `${stem} 거예요` // 살다, 만들다: основа на ㄹ
  if (jong !== 0) return `${stem}을 거예요`
  return `${stem.slice(0, -1)}${String.fromCharCode(0xac00 + code + 8)} 거예요` // 가 + ㄹ → 갈
}

const conj = (w: TWord, kind: Conjugation['kind']): Conjugation | null =>
  w.form && w.past
    ? { k: w.k, r: w.r, t: w.t, kind, present: w.form, past: w.past, neg: negate(w.k, w.form), ...(kind === 'verb' ? { future: futureForm(w.k) ?? undefined } : {}) }
    : null

/** Все глаголы и прилагательные с тремя формами. */
export const CONJUGATIONS: Conjugation[] = [
  ...VERBS.map(w => conj(w, 'verb')),
  ...ADJECTIVES.map(w => conj(w, 'adj')),
].filter((c): c is Conjugation => !!c)
