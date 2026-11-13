// Content-Security-Policy для страниц сайта. Токен владельца лежит в localStorage, поэтому чужой скрипт на странице опасен:
// политика разрешает только свои файлы и те встроенные скрипты, которые сайт сам положил в HTML (по их хэшу).
// Пока режим «только отчёт» (заголовок Content-Security-Policy-Report-Only): браузер ничего не блокирует, а о нарушениях
// сообщает на /api/csp-report, они видны в журнале событий. Включить по-настоящему: CSP_ENFORCE=1 в окружении сайта.
// Готовые заранее страницы (prerender: /about, /history) отдаются файлами мимо render:html: им заголовок ставится перед ответом
// по хэшам скриптов из самого файла; страницы из кэша Nitro хранят заголовок вместе с HTML.
import { createHash } from 'node:crypto'
import { getResponseHeader, setResponseHeader } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'

/** Встроенные скрипты без src. Блоки данных (JSON, JSON-LD) браузер не исполняет, им хэш не нужен; карте импорта (importmap) нужен. */
const INLINE = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi
const DATA_TYPE = /\btype=["']?application\/(ld\+)?json/i

export function inlineScriptHashes(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(INLINE)) {
    if (DATA_TYPE.test(m[1] ?? '') || !m[2]) continue
    out.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`)
  }
  return [...out]
}

export function cspPolicy(hashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    // у разметки справочников и игры много атрибутов style, стили оставлены встроенными
    "style-src 'self' 'unsafe-inline'",
    // картинки грамматики и видео отдаются перенаправлением на Яндекс.Диск (/api/pic, /api/video): без этих адресов включённая CSP их заблокирует
    "img-src 'self' data: blob: https://*.yandex.ru https://*.yandex.net",
    "media-src 'self' blob: https://*.yandex.ru https://*.yandex.net",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report',
  ].join('; ')
}

/** Текст готовой страницы из тела ответа (файл приходит буфером); остальное (потоки, пустой ответ 304) пропускается. */
export function htmlOf(body: unknown): string {
  if (typeof body === 'string') return body
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8')
  return ''
}

export default defineNitroPlugin(nitroApp => {
  const header = process.env.CSP_ENFORCE === '1' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const all = [...html.head, ...html.bodyPrepend, ...html.body, ...html.bodyAppend].join('')
    setResponseHeader(event, header, cspPolicy(inlineScriptHashes(all)))
  })
  // готовые файлы страниц: тело ответа уже прочитано, хэши считаются по нему (страниц мало, политика запоминается по адресу и длине)
  const ready = new Map<string, { size: number; policy: string }>()
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    if (getResponseHeader(event, header)) return
    if (!String(getResponseHeader(event, 'content-type') ?? '').includes('text/html')) return
    const html = htmlOf(response.body)
    if (!html) return
    const known = ready.get(event.path)
    if (known?.size === html.length) return setResponseHeader(event, header, known.policy)
    const policy = cspPolicy(inlineScriptHashes(html))
    if (ready.size < 50) ready.set(event.path, { size: html.length, policy })
    setResponseHeader(event, header, policy)
  })
})
