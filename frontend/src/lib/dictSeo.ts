/** Заголовки, описания и данные для поисковиков на страницах большого словаря (чистые функции, тест tests/dict-seo.test.mjs). */
import { BRAND, SITE } from '@/data/seo'

export interface SeoEntry {
  word: string
  pron: string
  pos: string
  level: string
  cat?: string
  senses: { ko: string; ru: { t: string; d: string }[]; sent: string[] }[]
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, '') + '…')
const first = (s: string) => s.split(';')[0]!.trim()

/** Главный перевод слова (первый из первого значения; если перевода нет, начало русского описания). */
export function mainTranslation(e: SeoEntry): string {
  for (const s of e.senses) for (const r of s.ru) if (r.t.trim()) return first(r.t)
  for (const s of e.senses) for (const r of s.ru) if (r.d.trim()) return clip(r.d.trim(), 60)
  return ''
}

/** Все переводы первых значений без повторов: «школа; учебное заведение». */
export function translations(e: SeoEntry, max = 4): string[] {
  const out: string[] = []
  for (const s of e.senses.slice(0, 3)) for (const r of s.ru) for (const t of r.t.split(';')) {
    const v = t.trim()
    if (v && !out.some(x => x.toLowerCase() === v.toLowerCase())) out.push(v)
  }
  return out.slice(0, max)
}

export const levelName = (l: string) => (l === 'нет' ? '' : `${l} уровень`)

/** `학교 — школа: перевод, значение, примеры и спряжение · 우리말` (до 70 знаков, без спряжения у слов, которые не спрягаются). */
export function wordTitle(e: SeoEntry): string {
  const ru = mainTranslation(e)
  const verbal = e.pos === 'глагол' || e.pos === 'прилагательное'
  const tail = verbal ? 'перевод, значение, примеры и спряжение' : 'перевод, значение и примеры'
  const t = ru ? `${e.word} — ${clip(ru, 28)}: ${tail}` : `${e.word}: ${tail}`
  return `${t} · ${BRAND}`
}

/** Описание 110–175 знаков: чтение, часть речи и уровень, переводы, куда ведёт страница. */
export function wordDescription(e: SeoEntry): string {
  const tr = translations(e).join('; ')
  const meta = [e.pos, levelName(e.level)].filter(Boolean).join(', ')
  const read = e.pron ? ` [${e.pron}]` : ''
  let d = `${e.word}${read}${meta ? ` (${meta})` : ''}${tr ? ` — ${tr}` : ''}. Значения слова, примеры предложений, словосочетания и формы. Корейско-русский словарь ${BRAND}.`
  if (d.length > 175) d = `${e.word}${read}${meta ? ` (${meta})` : ''}${tr ? ` — ${clip(tr, 70)}` : ''}. Значения, примеры и формы слова. Корейско-русский словарь ${BRAND}.`
  return clip(d, 175)
}

/** Фраза для живого читателя и для поисковика: «Как по-корейски "школа": 학교». */
export function wordLead(e: SeoEntry): string {
  const tr = translations(e, 3)
  const meta = [e.pos, levelName(e.level)].filter(Boolean).join(', ')
  const ru = tr.length ? `«${tr.join('», «')}»` : 'значения ниже'
  return `${e.word}${e.pron ? ` [${e.pron}]` : ''} — ${meta || 'слово'} корейского языка, по-русски ${ru}.${tr[0] ? ` Так по-корейски будет «${tr[0]}».` : ''}`
}

/** JSON-LD для страницы слова: определение термина и хлебные крошки. */
export function wordJsonLd(e: SeoEntry, url: string) {
  const def = e.senses[0]?.ru.map(r => r.t || r.d).filter(Boolean).join('; ') || ''
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        '@id': `${url}#term`,
        name: e.word,
        alternateName: e.pron || undefined,
        description: def ? clip(def, 300) : undefined,
        inLanguage: 'ko',
        url,
        inDefinedTermSet: { '@type': 'DefinedTermSet', name: '한국어기초사전 (Корейско-русский словарь)', url: `${SITE}/dict`, inLanguage: 'ru' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Большой словарь', item: `${SITE}/dict` },
          { '@type': 'ListItem', position: 3, name: e.word, item: url },
        ],
      },
    ],
  }
}
