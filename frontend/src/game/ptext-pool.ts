import { analyze } from '@/data/korean/parse'
import { TRANSLATIONS } from '@/data/korean/translations'
import { EXCHANGES } from './dialogs'
import { LONG_SENTENCES, longText } from './long-sentences'
import { RULE_SENTENCES, STORIES } from './stories'

/** Частица в предложении: где стоит, какая, к какой карточке грамматики относится и почему. */
export interface PtextMark { at: number; text: string; g: string; why: string }
export interface PtextSentence { ko: string; ru: string; marks: PtextMark[] }

let cache: PtextSentence[] | null = null

/**
 * Все предложения сайта, которые разбираются целиком, с найденными частицами. Общий пул для «Текстов по правилу» в игре и для экзамена («Итоговая оценка»).
 * Считается один раз на страницу.
 */
export function ptextPool(): PtextSentence[] {
  if (cache) return cache
  const all: Record<string, string> = { ...TRANSLATIONS }
  for (const st of STORIES) for (const x of st.sents) all[x.ko] = x.ru
  for (const e of EXCHANGES) {
    all[e[0]] = e[1]
    all[e[2]] = e[3]
  }
  for (const x of RULE_SENTENCES) all[x.ko] = x.ru
  // длинные предложения уровня «Мастер»; без тех, где у пропуска был бы второй верный вариант
  for (const x of LONG_SENTENCES) if (x.pool !== false) all[longText(x)] = x.ru
  const out: PtextSentence[] = []
  for (const ko of Object.keys(all)) {
    const segs = analyze(ko)
    if (segs.some(sg => sg.type === 'unknown')) continue
    const marks: PtextMark[] = []
    let cur = 0
    for (const sg of segs) {
      const at = ko.indexOf(sg.text, cur)
      if (at < 0) continue
      cur = at + sg.text.length
      if (sg.type === 'particle') marks.push({ at, text: sg.text, g: sg.g || '', why: sg.explain || sg.gloss || '' })
    }
    out.push({ ko, ru: all[ko]!, marks })
  }
  cache = out
  return out
}
