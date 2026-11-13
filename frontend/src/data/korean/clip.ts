import { KNOWN_STREAK } from '@/stores/progress'
import { analyze, particleStem } from './parse'
import { STUDY } from './study'
import type { Word } from './words'

/** Сколько знаков вставленного текста берём (всё, что дальше, отбрасывается). */
export const CLIP_MAX = 2000
/** Сколько разных слов проверяем в большом словаре сразу после вставки; остальные проверяются нажатием. */
export const CLIP_LOOKUP_MAX = 80

/** Слова владельца для подсветки: только слова для заданий (`STUDY`), по словарной форме. */
const OWN = new Map<string, Word>(STUDY.map(w => [w.k, w]))

/** Состояние слова в тексте: из своего словаря (по очкам) или пока неизвестное (дальше решает большой словарь). */
export type ClipState = 'learned' | 'learning' | 'new' | 'unknown'

export interface ClipWord {
  /** словарная форма, если разбор её нашёл, иначе слово как в тексте */
  key: string
  /** слово как в тексте, без знаков вокруг */
  core: string
  lemma?: string
  /** запись из своего словаря */
  own?: Word
  streak: number
  state: ClipState
  /** что искать в большом словаре, по порядку (форму слова сервер приводит к словарной сам) */
  queries: string[]
}

/** Кусок текста: пробелы и знаки идут как есть, у слова есть `word`. */
export interface ClipPart {
  text: string
  word?: ClipWord
}

export interface ClipResult {
  parts: ClipPart[]
  /** разные слова текста в порядке появления */
  words: ClipWord[]
  /** слов из своего словаря (любые очки) */
  known: number
  /** из них выучено (очки не меньше KNOWN_STREAK) */
  learned: number
  total: number
  /** текст длиннее CLIP_MAX и был обрезан */
  cut: boolean
}

const EDGE = /^([^가-힣]*)(.*?)([^가-힣]*)$/s

/** Словарная форма слова из разбора предложения (`analyze`): «가요» → 가다, «학교에서» → 학교. */
function lemmaOf(core: string): string | undefined {
  const segs = analyze(core)
  const main = segs.find(s => s.type === 'word' || s.type === 'verb')
  if (!main) return undefined
  const base = main.lemma ?? main.text
  // «공부해요» разбор отдаёт как «공부» + «해요»: слово тогда 공부하다, если оно есть у владельца
  if (main.type === 'word' && segs[1]?.text === '해요' && OWN.has(`${base}하다`)) return `${base}하다`
  return base
}

function makeWord(core: string, streakOf: (k: string) => number): ClipWord {
  const lemma = lemmaOf(core)
  const own = lemma ? OWN.get(lemma) : undefined
  const key = own?.k ?? lemma ?? core
  const streak = own ? streakOf(own.k) : 0
  const state: ClipState = !own ? 'unknown' : streak >= KNOWN_STREAK ? 'learned' : streak > 0 ? 'learning' : 'new'
  const stem = lemma ? null : particleStem(core)
  const queries = [...new Set([lemma ?? core, stem].filter((q): q is string => !!q))]
  return { key, core, lemma, own, streak, state, queries }
}

/**
 * Разбирает вставленный текст: режет по пробелам, приводит каждое слово к словарной форме разбором предложений (`parse.ts`)
 * и сверяет с `STUDY`. Чистая функция: ничего не сохраняет и не обращается к серверу.
 * @param streakOf очки слова (из прогресса владельца)
 */
export function clipText(text: string, streakOf: (k: string) => number = () => 0): ClipResult {
  const cut = text.length > CLIP_MAX
  const src = cut ? text.slice(0, CLIP_MAX) : text
  const parts: ClipPart[] = []
  const byKey = new Map<string, ClipWord>()
  const cache = new Map<string, ClipWord>()
  for (const piece of src.split(/(\s+)/)) {
    if (!piece) continue
    const m = EDGE.exec(piece)
    const core = m?.[2] ?? ''
    if (/^\s+$/.test(piece) || !/[가-힣]/.test(core) || core.length > 30) {
      parts.push({ text: piece })
      continue
    }
    let w = cache.get(core)
    if (!w) cache.set(core, (w = makeWord(core, streakOf)))
    const first = byKey.get(w.key)
    if (!first) byKey.set(w.key, w)
    if (m![1]) parts.push({ text: m![1] })
    parts.push({ text: core, word: first ?? w })
    if (m![3]) parts.push({ text: m![3] })
  }
  const words = [...byKey.values()]
  return {
    parts,
    words,
    known: words.filter(w => w.own).length,
    learned: words.filter(w => w.state === 'learned').length,
    total: words.length,
    cut,
  }
}

/** Ответ `GET /api/dict/search`, нужная часть. */
export interface DictReply<H extends { word: string }> {
  hits: H[]
  via?: { forms: string[] }
}

/**
 * Запись большого словаря, которая и есть искомое слово: то же слово или словарная форма, которую сервер угадал по спряжению
 * (`가요` → 가다). Просто похожие слова поиска (по началу слова, по переводу) не считаются.
 */
export function pickDictHit<H extends { word: string }>(query: string, reply: DictReply<H>): H | null {
  const exact = reply.hits.find(h => h.word === query)
  if (exact) return exact
  const forms = reply.via?.forms
  return (forms && reply.hits.find(h => forms.includes(h.word))) || null
}
