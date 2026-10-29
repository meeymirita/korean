import { groups } from '@/data/alphabet'
import { G, type Gram } from './grammar'
import { cheatHtml, hangulHtml, numbersHtml, readingHtml, talkHtml } from './pages'
import { blk, norm } from './render'
import { D, SE, parseQuery, score, type Word } from './words'
import { TRANSLATIONS } from './translations'

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
  total: number
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
  const total =
    words.length +
    grammar.length +
    letters.length +
    sentences.length +
    Object.values(chunks).reduce((n, l) => n + l.length, 0)
  return { words, grammar, chunks, letters, sentences, total }
}

/** Фрагмент вокруг первого совпадения. */
export function snippet(text: string, raw: string, len = 150) {
  if (text.length <= len) return text
  const t = norm(text)
  const i = Math.min(...parseQuery(raw).map(q => t.indexOf(q)).filter(n => n >= 0), text.length)
  const start = Math.max(0, i - 40)
  return (start ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '')
}
