/** Заголовки, описания и разметка для русско-корейских страниц «школа по-корейски» (чистые функции, тест `frontend/test/ru-pages.spec.ts`). */
import { BRAND, SITE } from '@/data/seo'

export interface RuEntry {
  word: string
  pron: string
  pos: string
  level: string
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;:.]+\S*$/, '') + '…')

/** «школа по-корейски: 학교, перевод и примеры · 우리말» (до 70 знаков). */
export function ruTitle(q: string, words: RuEntry[]): string {
  const ko = words.slice(0, 2).map(w => w.word).join(', ')
  return clip(`${q} по-корейски${ko ? `: ${ko}` : ''}, перевод и примеры`, 62) + ` · ${BRAND}`
}

/** Описание 110–175 знаков: как сказать по-корейски, чтение, часть речи, куда ведёт страница. */
export function ruDescription(q: string, words: RuEntry[]): string {
  const list = words.slice(0, 3).map(w => `${w.word}${w.pron ? ` [${w.pron}]` : ''}`).join(', ')
  const d = `Как по-корейски «${q}»: ${list}. Перевод, часть речи, уровень, примеры предложений и значения слов. Русско-корейский словарь ${BRAND}.`
  return clip(d, 175)
}

/** Фраза для читателя и поисковика под заголовком. */
export function ruLead(q: string, words: RuEntry[]): string {
  const first = words[0]
  if (!first) return ''
  const more = words.length > 1 ? ` Ещё варианты: ${words.slice(1, 4).map(w => w.word).join(', ')}.` : ''
  return `По-корейски «${q}» будет ${first.word}${first.pron ? ` [${first.pron}]` : ''} (${[first.pos, first.level === 'нет' ? '' : `${first.level} уровень`].filter(Boolean).join(', ') || 'слово'}).${more}`
}

/** JSON-LD: хлебные крошки (расширенный сниппет Google). */
export function ruJsonLd(q: string, pageUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Словарь', item: `${SITE}/dict` },
      { '@type': 'ListItem', position: 2, name: 'Русско-корейский словарь', item: `${SITE}/ru` },
      { '@type': 'ListItem', position: 3, name: `${q} по-корейски`, item: pageUrl },
    ],
  }
}
