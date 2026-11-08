/** Учёт заходов на большой словарь и подборки: чистые функции (разбор адреса и User-Agent), без базы. */

export type VisitKind = 'dict' | 'word' | 'set' | 'sets'

/** Известные роботы поисковиков и сервисов: по ним видно, ходит ли поисковик; всё остальное, где нет «bot», считается человеком. */
const BOTS: [RegExp, string][] = [
  [/googlebot|google-inspectiontool|adsbot-google|googleother|apis-google/i, 'google'],
  [/yandex/i, 'yandex'],
  [/bingbot|bingpreview|msnbot/i, 'bing'],
  [/duckduckbot/i, 'duckduckgo'],
  [/applebot/i, 'apple'],
  [/baiduspider/i, 'baidu'],
  [/ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|dataforseo|seznambot/i, 'seo-сервисы'],
  [/telegrambot|vkshare|facebookexternalhit|twitterbot|whatsapp|slackbot|discordbot/i, 'превью ссылок'],
  [/bot|crawl|spider|slurp|headless|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|scrapy|monitor|uptime|lighthouse/i, 'прочие роботы'],
]

export const whoIs = (ua: string): string => {
  if (!ua.trim()) return 'прочие роботы' // человек всегда присылает User-Agent
  for (const [re, name] of BOTS) if (re.test(ua)) return name
  return 'человек'
}

/** Адрес страницы → что это: `/dict` (главная словаря), `/dict/<слово>`, `/dict/podborki`, `/dict/podborki/<подборка>`. Остальное не учитываем. */
export function visitOf(rawPath: string): { kind: VisitKind; ref: string } | null {
  let p = String(rawPath ?? '').split(/[?#]/)[0]!.replace(/\/+$/, '')
  if (p === '/dict') return { kind: 'dict', ref: '' }
  if (!p.startsWith('/dict/')) return null
  p = p.slice('/dict/'.length)
  if (p === 'podborki') return { kind: 'sets', ref: '' }
  if (p.startsWith('podborki/')) {
    const slug = p.slice('podborki/'.length)
    return /^[a-z0-9-]{1,40}$/.test(slug) ? { kind: 'set', ref: slug } : null
  }
  let word = p
  try { word = decodeURIComponent(p) } catch { return null }
  word = word.replace(/\s+/g, ' ').trim()
  if (!word || word.length > 60 || word.includes('/')) return null
  return { kind: 'word', ref: word }
}

/** Откуда пришёл человек: только имя сайта (`google.com`, `yandex.ru`), без пути и параметров; свой сайт и пустое значение дают пустую строку. */
export function sourceOf(referrer: string): string {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '').slice(0, 60)
    return host === 'korean.meeymirita.ru' ? '' : host
  } catch {
    return ''
  }
}

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
