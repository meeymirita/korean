import { groups } from '@/data/alphabet'
import { G, type Gram } from './grammar'
import { cheatHtml, hangulHtml, numbersHtml, readingHtml, talkHtml } from './pages'
import { blk, norm } from './render'
import { D, SE, parseQuery, score, type Word } from './words'
import { TRANSLATIONS } from './translations'
import type { PrivateSearchReply, SearchCategory } from '@/types/search'
import { fetchT } from '@/lib/http'
import { CONJUGATIONS, type Conjugation } from './conjugation'
import { ALL_GAMES } from '@/data/games'

/** Кусок текста со страницы справочника. */
export interface Chunk {
  tab: string
  group: string
  text: string
  /** фраза из разговорника */
  phrase?: boolean
}

export interface LetterEntry {
  char: string
  text: string
}

export interface GrammarEntry {
  g: Gram
  text: string
}

export interface SentenceEntry {
  s: string
  tr: string
  text: string
}

export interface SearchResult {
  words: Word[]
  grammar: GrammarEntry[]
  chunks: Record<string, Chunk[]>
  letters: LetterEntry[]
  sentences: SentenceEntry[]
  forms: Conjugation[]
  total: number
}

export interface SearchDocument {
  id: string
  category: SearchCategory
  title: string
  text: string
  target?: string
  group?: string
}

export interface SearchReply {
  query: string
  hits: SearchDocument[]
  total: number
  limit: number
  offset: number
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const body = (html: string) => new DOMParser().parseFromString(html.replace(/></g, '> <'), 'text/html').body

const PAGES: [string, () => string][] = [
  ['cheat', cheatHtml],
  ['talk', talkHtml],
  ['hangul', () => hangulHtml],
  ['reading', () => readingHtml],
  ['numbers', numbersHtml],
]
const SEL = 'h2.st, h3, summary, tr, .ph, .exl > div, .nm > div, p, .rule, .formula, .warn, .tip, .ok, .pron, pre, .dl i'

function chunksOf(tab: string, html: string): Chunk[] {
  const out: Chunk[] = []
  let group = ''
  body(html)
    .querySelectorAll<HTMLElement>(SEL)
    .forEach(el => {
      if (el.closest('.hg')) return
      const tag = el.tagName
      if (tag === 'H2' || tag === 'H3' || tag === 'SUMMARY') {
        group = clean(el.textContent || '')
        return
      }
      let texts: string[]
      if (tag === 'TR') {
        const cells = [...el.querySelectorAll('td')]
        if (!cells.length) return
        texts = [cells.map(c => clean(c.textContent || '')).join(' · ')]
      } else if (tag === 'PRE') {
        texts = (el.textContent || '').split('\n').map(clean)
      } else if (el.classList.contains('ph')) {
        texts = [[...el.children].map(c => clean(c.textContent || '')).join(' — ')]
      } else if (el.parentElement?.classList.contains('exl') || el.parentElement?.classList.contains('nm')) {
        texts = [[...el.children].map(c => clean(c.textContent || '')).join(' — ')]
      } else {
        texts = [clean(el.textContent || '')]
      }
      texts.filter(Boolean).forEach(text => out.push({ tab, group, text, phrase: el.classList.contains('ph') || undefined }))
    })
  return out
}

let cache: {
  chunks: Chunk[]
  grammar: GrammarEntry[]
  letters: LetterEntry[]
  sentences: SentenceEntry[]
} | null = null

export function index() {
  if (cache) return cache
  cache = {
    chunks: PAGES.flatMap(([tab, html]) => chunksOf(tab, html())),
    grammar: G.map(g => ({
      g,
      text: clean(
        [g.ko, g.ru, g.s, g.l, g.d].join(' ') +
          ' ' +
          g.b.map(b => body(blk(b)).textContent || '').join(' '),
      ),
    })),
    letters: groups.flatMap(gr =>
      gr.letters.map(l => ({ char: l.char, text: `${l.char} ${l.reading} ${l.roman} ${l.hint ?? ''}` })),
    ),
    sentences: SE.map(d => ({ s: d.s, tr: TRANSLATIONS[d.s] ?? '', text: `${d.s} ${TRANSLATIONS[d.s] ?? ''}` })),
  }
  return cache
}

/** Собирает публичный каталог для загрузки в Meilisearch; пользовательские данные сюда не попадают. */
export function searchDocuments(): SearchDocument[] {
  const ix = index()
  const referencePositions: Record<string, number> = {}
  return [
    ...D.map(d => ({ id: `word:${d.n}`, category: 'word' as const, title: d.k, text: [d.k, d.r, d.t, d.s].filter(Boolean).join(' '), target: `/korean/words?q=${encodeURIComponent(d.k)}` })),
    ...ix.grammar.map(({ g, text }) => ({ id: `grammar:${g.id}`, category: 'grammar' as const, title: `${g.ko} — ${g.ru}`, text: [g.ko, g.ru, g.s, g.d, text].filter(Boolean).join(' '), target: `/korean/grammar?q=${encodeURIComponent(g.id)}`, group: g.l || g.s })),
    ...SE.map((word, i) => {
      const translation = TRANSLATIONS[word.s] ?? ''
      return { id: `sentence:${i}`, category: 'sentence' as const, title: word.s, text: [word.s, translation, word.k, word.r, word.t].filter(Boolean).join(' '), target: `/korean/ref/sentences?q=${encodeURIComponent(word.s)}` }
    }),
    ...ix.letters.map((e, i) => ({ id: `letter:${i}`, category: 'letter' as const, title: e.char, text: e.text, target: '/korean/ref/alphabet' })),
    ...CONJUGATIONS.map((e, i) => ({ id: `form:${i}`, category: 'form' as const, title: e.k, text: [e.k, e.r, e.t, e.present, e.past, e.neg].join(' '), target: `/korean/forms?q=${encodeURIComponent(e.k)}`, group: e.kind === 'verb' ? 'Глаголы' : 'Прилагательные' })),
    ...ALL_GAMES.map(game => ({ id: `game:${game.id}`, category: 'game' as const, title: game.name, text: `${game.name} ${game.desc}`, target: game.to })),
    ...ix.chunks.map(e => {
      const i = referencePositions[e.tab] ?? 0
      referencePositions[e.tab] = i + 1
      return { id: `reference:${e.tab}:${i}`, category: 'reference' as const, title: e.group || e.tab, text: e.text, target: `/korean/ref/${e.tab}`, group: e.group }
    }),
  ]
}

/** Ищет игры в общем публичном индексе; null включает локальный запасной поиск. */
export async function searchGamesRemote(raw: string): Promise<string[] | null> {
  const reply = await searchRemote(raw, 0, 'game')
  return reply ? reply.hits.map(hit => hit.id.replace(/^game:/, '')).filter(id => ALL_GAMES.some(game => game.id === id)) : null
}

/** Преобразует выдачу Meilisearch в готовые записи, которыми пользуются существующие окна поиска. */
export function resultFromSearchReply(reply: SearchReply): SearchResult {
  const ix = index()
  const words: Word[] = []
  const grammar: GrammarEntry[] = []
  const chunks: Record<string, Chunk[]> = {}
  const letters: LetterEntry[] = []
  const sentences: SentenceEntry[] = []
  const forms: Conjugation[] = []
  for (const hit of reply.hits) {
    const [, , key] = hit.id.match(/^(word|grammar|sentence|letter|reference|form):(.+?)(?::(\d+))?$/) || []
    if (hit.category === 'word') {
      const value = D.find(item => item.n === Number(key))
      if (value) words.push(value)
    } else if (hit.category === 'grammar') {
      const value = ix.grammar.find(item => item.g.id === key)
      if (value) grammar.push(value)
    } else if (hit.category === 'sentence') {
      const value = ix.sentences[Number(key)]
      if (value) sentences.push(value)
    } else if (hit.category === 'letter') {
      const value = ix.letters[Number(key)]
      if (value) letters.push(value)
    } else if (hit.category === 'form') {
      const value = CONJUGATIONS[Number(key)]
      if (value) forms.push(value)
    } else if (hit.category === 'reference') {
      const match = hit.id.match(/^reference:([^:]+):(\d+)$/)
      const value = match ? ix.chunks.filter(item => item.tab === match[1])[Number(match[2])] : undefined
      if (value) (chunks[value.tab] ||= []).push(value)
    }
  }
  return { words, grammar, chunks, letters, sentences, forms, total: reply.total }
}

/** Добавляет к локальной выдаче то, чего в ней нет (индекс нечувствителен к опечаткам), не дублируя и не меняя порядок локальных результатов:
 * локальный поиск ищет и по части слова, и по переводам, поэтому он главный, а индекс только дополняет. */
export function mergeSearchResults(local: SearchResult | null, remote: SearchResult): SearchResult {
  const base: SearchResult = local ?? { words: [], grammar: [], chunks: {}, letters: [], sentences: [], forms: [], total: 0 }
  const extra = <T>(have: T[], more: T[], key: (item: T) => unknown) => {
    const seen = new Set(have.map(key))
    return [...have, ...more.filter(item => !seen.has(key(item)))]
  }
  const chunks: Record<string, Chunk[]> = { ...base.chunks }
  for (const [tab, items] of Object.entries(remote.chunks)) chunks[tab] = extra(chunks[tab] ?? [], items, c => c.text)
  const merged = {
    words: extra(base.words, remote.words, w => w.n),
    grammar: extra(base.grammar, remote.grammar, g => g.g.id),
    chunks,
    letters: extra(base.letters, remote.letters, l => l.char),
    sentences: extra(base.sentences, remote.sentences, e => e.s),
    forms: extra(base.forms, remote.forms, f => f.k),
  }
  const total = merged.words.length + merged.grammar.length + merged.letters.length + merged.sentences.length + merged.forms.length + Object.values(chunks).reduce((n, l) => n + l.length, 0)
  return { ...merged, total }
}

/** Склеивает страницы выдачи, не теряя группировку, используемую поисковыми окнами. */
export function appendSearchResults(current: SearchResult, next: SearchResult): SearchResult {
  const chunks: Record<string, Chunk[]> = { ...current.chunks }
  for (const [tab, items] of Object.entries(next.chunks)) chunks[tab] = [...(chunks[tab] ?? []), ...items]
  return {
    words: [...current.words, ...next.words],
    grammar: [...current.grammar, ...next.grammar],
    chunks,
    letters: [...current.letters, ...next.letters],
    sentences: [...current.sentences, ...next.sentences],
    forms: [...current.forms, ...next.forms],
    total: next.total,
  }
}

/** Ищет через серверный Meilisearch; null означает, что включился локальный запасной поиск. */
export async function searchRemote(raw: string, offset = 0, category?: SearchCategory): Promise<SearchReply | null> {
  const query = parseQuery(raw).join(' ')
  if (!query) return null
  try {
    const params = new URLSearchParams({ q: query, offset: String(offset) })
    if (category) params.set('category', category)
    const response = await fetchT(`/api/search?${params}`)
    if (!response.ok) return null
    const reply = await response.json() as SearchReply
    // пустая выдача индекса не заменяет локальный поиск: он ищет и по части слова, и по переводам, а индекс пока может быть не собран
    return reply.hits.length || offset > 0 ? reply : null
  } catch {
    return null
  }
}

/** Ищет по владельческим заметкам или галерее; маршрут закрыт токеном владельца. */
export async function searchPrivateRemote(raw: string, category: 'note' | 'image', token: string): Promise<PrivateSearchReply | null> {
  const query = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (!query || !token) return null
  try {
    const params = new URLSearchParams({ q: query, category })
    const response = await fetchT(`/api/search/private?${params}`, { headers: { Authorization: `Bearer ${token}` } }, 60_000)
    if (!response.ok) return null
    return await response.json() as PrivateSearchReply
  } catch {
    return null
  }
}

const hasAll = (text: string, qs: string[]) => {
  const t = norm(text)
  return qs.every(q => t.includes(q))
}

export function search(raw: string): SearchResult | null {
  const qs = parseQuery(raw)
  if (!qs.length) return null
  const ix = index()
  const words = D.map(d => [score(d, qs), d] as const)
    .filter(x => x[0] > 10)
    .sort((a, b) => b[0] - a[0] || a[1].n - b[1].n)
    .map(x => x[1])
  const grammar = ix.grammar.filter(e => hasAll(e.text, qs))
  const chunks: Record<string, Chunk[]> = {}
  ix.chunks.filter(c => hasAll(c.text, qs)).forEach(c => (chunks[c.tab] ||= []).push(c))
  const letters = ix.letters.filter(l => hasAll(l.text, qs))
  const sentences = ix.sentences.filter(e => hasAll(e.text, qs))
  const forms = CONJUGATIONS.filter(e => hasAll([e.k, e.r, e.t, e.present, e.past, e.neg].join(' '), qs))
  const total =
    words.length +
    grammar.length +
    letters.length +
    sentences.length +
    forms.length +
    Object.values(chunks).reduce((n, l) => n + l.length, 0)
  return { words, grammar, chunks, letters, sentences, forms, total }
}

/** Фрагмент вокруг первого совпадения. */
export function snippet(text: string, raw: string, len = 150) {
  if (text.length <= len) return text
  const t = norm(text)
  const i = Math.min(...parseQuery(raw).map(q => t.indexOf(q)).filter(n => n >= 0), text.length)
  const start = Math.max(0, i - 40)
  return (start ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '')
}
