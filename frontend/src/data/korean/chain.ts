import { shuffle, short, type Task } from './tasks'
import { STUDY } from './study'

/** Слово цепочки: одно корейское слово (хангыль без пробелов и скобок) из `STUDY`, от двух слогов. */
export interface ChainWord {
  k: string
  /** короткий русский перевод */
  t: string
}

export const firstSyllable = (k: string): string => [...k][0] ?? ''
export const lastSyllable = (k: string): string => [...k].at(-1) ?? ''

/** Слова для цепочек: только `STUDY` (не `D` и не `EXTRA`), без повторов, от двух слогов, только хангыль. */
export function chainWords(source: readonly { k: string; t: string }[] = STUDY): ChainWord[] {
  const seen = new Map<string, ChainWord>()
  for (const d of source) {
    if (!/^[가-힣]{2,}$/.test(d.k) || seen.has(d.k)) continue
    seen.set(d.k, { k: d.k, t: short(d.t) })
  }
  return [...seen.values()]
}

/** Индекс «первый слог → слова, которые с него начинаются». */
export function firstSyllableIndex(words: readonly ChainWord[]): Map<string, ChainWord[]> {
  const idx = new Map<string, ChainWord[]>()
  for (const w of words) {
    const s = firstSyllable(w.k)
    const list = idx.get(s)
    if (list) list.push(w)
    else idx.set(s, [w])
  }
  return idx
}

/** Слова, которые могут идти после `w`: первый слог совпадает с последним слогом `w`, само слово не считается. */
export const continuations = (w: ChainWord, idx: Map<string, ChainWord[]>): ChainWord[] =>
  (idx.get(lastSyllable(w.k)) ?? []).filter(x => x.k !== w.k)

/**
 * Цепочка из `links + 1` разных слов: у каждого следующего первый слог равен последнему слогу предыдущего.
 * Поиск с возвратом, поэтому тупик (слово без продолжения) цепочку не обрывает; `null`, если такой цепочки нет.
 * `shuf` подменяют в тестах, чтобы получить предсказуемый порядок.
 */
export function buildChain(idx: Map<string, ChainWord[]>, links: number, shuf: <T>(a: T[]) => T[] = shuffle): ChainWord[] | null {
  const all = shuf([...idx.values()].flat())
  const used = new Set<string>()
  const path: ChainWord[] = []
  let budget = 20000 // страховка от долгого перебора
  const go = (w: ChainWord): boolean => {
    path.push(w)
    used.add(w.k)
    if (path.length === links + 1) return true
    if (budget-- > 0) for (const n of shuf(continuations(w, idx))) if (!used.has(n.k) && go(n)) return true
    path.pop()
    used.delete(w.k)
    return false
  }
  for (const w of all) {
    budget = 20000
    if (go(w)) return path.slice()
  }
  return null
}

/** Три неверных варианта: первый слог другой, чем нужный, поэтому верный ровно один. */
export function distractors(need: string, avoid: readonly string[], words: readonly ChainWord[], n = 3, shuf: <T>(a: T[]) => T[] = shuffle): ChainWord[] {
  return shuf(words.filter(w => firstSyllable(w.k) !== need && !avoid.includes(w.k))).slice(0, n)
}

/** Задания серии: опорное слово, четыре варианта, перевод в разборе (`Task.note`). Очки слов не меняются (`word` не задан). */
export function chainTasks(links = 12, words: readonly ChainWord[] = chainWords()): Task[] {
  const chain = buildChain(firstSyllableIndex(words), links)
  if (!chain) return []
  return chain.slice(0, -1).map((cur, i) => {
    const next = chain[i + 1]!
    const need = lastSyllable(cur.k)
    const options = shuffle([next, ...distractors(need, chain.map(c => c.k), words)]).map(w => w.k)
    return {
      id: i,
      kind: 'tr',
      title: 'Продолжи цепочку: слово на последний слог',
      prompt: cur.k,
      hint: `Последний слог: «${need}»`,
      options,
      answer: next.k,
      note: `«${cur.k}» (${cur.t}) заканчивается на «${need}», поэтому дальше «${next.k}» (${next.t}).`,
    }
  })
}
