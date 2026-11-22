import { clipText } from './clip'
import { VLOGS } from './vlogs'
import { passes } from './vlog-study'

/**
 * Где слово звучит во влогах: словарная форма слова (как её находит `clipText`) → фразы влогов, в которых оно есть (один проход рассказа, без повторов).
 * Индекс строится один раз при первом обращении (около четырёх тысяч фраз) и только в браузере; нужен только владельцу (влоги закрыты токеном).
 */
export interface VlogHit {
  id: string
  title: string
  /** номер фразы в `vlog.lines` */
  i: number
  /** начало фразы, секунды */
  s: number
  ko: string
  ru: string
}

/** Сколько фраз на слово хранится: самых частых слов тысячи фраз, нам хватает нескольких. */
const KEEP = 24
let index: Map<string, VlogHit[]> | null = null

function build(): Map<string, VlogHit[]> {
  const m = new Map<string, VlogHit[]>()
  for (const v of VLOGS) {
    passes(v.lines).first.forEach((l, i) => {
      for (const w of clipText(l.ko, () => 0).words) {
        const list = m.get(w.key) ?? m.set(w.key, []).get(w.key)!
        if (list.length < KEEP) list.push({ id: v.id, title: v.title, i, s: l.s, ko: l.ko, ru: l.ru })
      }
    })
  }
  return m
}

/** Фразы влогов со словом `key` (без влога `exclude`, обычно открытого сейчас); короткие фразы раньше длинных, не больше `limit`. */
export function vlogHitsFor(key: string, exclude = '', limit = 5): { hits: VlogHit[]; total: number } {
  index ??= build()
  const all = (index.get(key) ?? []).filter(h => h.id !== exclude)
  return { hits: [...all].sort((a, b) => a.ko.length - b.ko.length).slice(0, limit), total: all.length }
}
