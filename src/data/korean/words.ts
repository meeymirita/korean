import { CAT, CATN, RAW, SYN } from './dictionary'
import { norm } from './render'

export interface Word {
  n: number
  k: string
  r: string
  t: string
  s: string
  /** нормализованные поля для поиска */
  ft: string
  fr: string
  fs: string
  /** категории слова */
  c: string[]
}

const W2C: Record<string, string[]> = {}
Object.entries(CAT).forEach(([c, list]) => list.forEach(w => (W2C[w] = W2C[w] || []).push(c)))

export const D: Word[] = RAW.map(d => ({
  ...d,
  ft: norm(d.t),
  fr: norm(d.r),
  fs: norm(d.s),
  c: W2C[d.k] || [],
}))

export { CATN }

/** Запрос → слова поиска (с учётом форм глаголов: «ем» → «есть»). */
export const parseQuery = (raw: string) =>
  norm(raw)
    .split(/\s+/)
    .filter(Boolean)
    .map(w => SYN[w] || w)

export function score(d: Word, qs: string[]) {
  let tot = 0
  for (const q of qs) {
    let s = 0
    const words = d.ft.split(/[^а-яa-z0-9ё]+/).filter(Boolean)
    if (d.ft === q || words.includes(q)) s = 100
    else if (words.some(w => w.startsWith(q))) s = 70
    else if (d.k === q) s = 95
    else if (d.k.startsWith(q)) s = 80
    else if (d.k.includes(q)) s = 50
    else if (d.fr === q) s = 90
    else if (d.fr.startsWith(q)) s = 60
    else if (d.ft.includes(q)) s = 40
    else if (d.fr.includes(q)) s = 30
    else if (d.fs.includes(q) || d.s.includes(q)) s = 10
    if (!s) return 0
    tot += s
  }
  return tot
}

/** Уникальные предложения из словаря. */
export const SE: Word[] = (() => {
  const seen = new Set<string>()
  const out: Word[] = []
  D.forEach(d => {
    if (d.s && !seen.has(d.s)) {
      seen.add(d.s)
      out.push(d)
    }
  })
  return out
})()
