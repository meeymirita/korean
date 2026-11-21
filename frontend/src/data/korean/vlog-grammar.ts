import { G, firstBlock, type Gram } from './grammar'

/**
 * Грамматика во фразах влога: по тексту фразы находит темы из карточек (`grammar.ts`), чтобы показать их по нажатию.
 * Это подсказка по окончаниям и частицам, а не полный разбор: ищутся самые частые и заметные формы (будущее, прошедшее, -고, -러 가, 에서 …).
 */
export interface VlogGram {
  id: string
  /** название темы, как на карточке */
  ko: string
  ru: string
}

/** Состояние темы у владельца: пройдена (`ok`), впереди (`ahead`), есть в курсе, но не отмечена пройденной (`other`). */
export type GramState = 'ok' | 'ahead' | 'other'
export const gramState = (g: Pick<Gram, 'st' | 'ahead'>): GramState => (g.st === 'ok' ? 'ok' : g.ahead ? 'ahead' : 'other')

const byId = new Map(G.map(g => [g.id, g]))
export const gramById = (id: string) => byId.get(id)

/** Номер последней буквы слога: ㄹ = 8, ㅆ = 20; -1 если это не слог хангыля. */
export const finalOf = (ch: string | undefined): number => {
  const n = (ch?.charCodeAt(0) ?? 0) - 0xac00
  return n >= 0 && n < 11172 ? n % 28 : -1
}

/** Слова фразы без знаков вокруг. */
const tokensOf = (ko: string) => ko.split(/\s+/).map(t => t.replace(/^[^가-힣A-Za-z0-9]+|[^가-힣A-Za-z0-9]+$/g, '')).filter(Boolean)
const last = (t: string) => t[t.length - 1]
const NOT_REO = new Set(['그러', '이러', '저러', '어러', '여러'])

type Rule = [id: string, test: (t: string, next: string | undefined, prev: string | undefined) => boolean]
const RULES: Rule[] = [
  ['future_my', (t, _n, prev) => t === '거예요' && !!prev && finalOf(last(prev)) === 8],
  ['past_my', t => {
    const m = /^(.*)(어요|습니다)$/.exec(t)
    return !!m && /[가-힣]$/.test(m[1]!) && finalOf(last(m[1]!)) === 20 && !/있(어요|습니다)$/.test(t)
  }],
  ['b14_reo', t => /[가-힣]러$/.test(t) && t.length > 1 && !NOT_REO.has(t)],
  ['next_lkka', t => t.endsWith('까요')],
  ['gosipda', (t, n) => t.endsWith('고') && !!n && n.startsWith('싶')],
  ['next_go', (t, n) => t.length > 1 && t.endsWith('고') && t !== '그리고' && !/[다라냐자]고$/.test(t) && !(n && n.startsWith('싶'))],
  ['b9_ji', (t, _n, prev) => t === '마세요' && !!prev && prev.endsWith('지')],
  ['b9_se', t => t.endsWith('세요') && t !== '마세요'],
  ['eseo', t => t.length > 2 && t.endsWith('에서')],
  ['gada', (t, n) => t.length > 1 && t.endsWith('에') && !!n && /^(가|가요|가서|가고|갈|갑니다|와|와요|오|옵니다)$/.test(n)],
  ['iyo', t => /(이에요|예요)$/.test(t) && t !== '거예요'],
  ['juse', t => t.endsWith('주세요')],
  ['mnida', t => t.length > 2 && t.endsWith('니다')],
  ['b12_jiman', t => t.length > 2 && t.endsWith('지만')],
  ['b13_neyo', t => t.length > 2 && t.endsWith('네요')],
  ['b12_jiyo', t => t.length > 2 && /지요$/.test(t)],
  ['buteo', t => t.endsWith('부터') && t.length > 2],
]

/** Темы грамматики во фразе, по одной на тему, в порядке появления. */
export function grammarHints(ko: string): VlogGram[] {
  const toks = tokensOf(ko)
  const found = new Map<string, number>()
  toks.forEach((t, i) => {
    for (const [id, test] of RULES) if (!found.has(id) && test(t, toks[i + 1], toks[i - 1])) found.set(id, i)
  })
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .flatMap(([id]) => {
      const g = byId.get(id)
      return g ? [{ id, ko: g.ko, ru: g.ru }] : []
    })
}

/** Текст карточки без разметки `{b|…}`. */
const plain = (s: string) => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<br\s*\/?>/g, ' ')

/** Всё, что показываем по нажатию на тему: название, смысл, формула, первый пример, состояние. */
export function gramCard(id: string) {
  const g = byId.get(id)
  if (!g) return null
  const ex = firstBlock(g.b, 'ex')?.[0]
  return { id, ko: g.ko, ru: g.ru, d: g.d, state: gramState(g), formula: plain(firstBlock(g.b, 'formula') ?? ''), example: ex ? { ko: plain(ex[0]), ru: plain(ex[1]) } : null }
}
