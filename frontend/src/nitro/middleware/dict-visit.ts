// Учёт заходов на большой словарь и подборки: на каждый запрос страницы /dict... серверная часть сайта сообщает об этом API
// (backend/src/dict/dict.visits.service.ts). Работает до кэша Nitro, поэтому видны и заходы поисковых роботов, и страницы из кэша.
// Ошибки учёта молча игнорируются: страница от них не зависит.
import { defineEventHandler, getRequestHeader, getRequestURL, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'

const skip = (path: string) => path.endsWith('_payload.json') || path.startsWith('/_nuxt') || /\.(png|jpe?g|webp|svg|ico|css|js|map|txt|xml|json)$/i.test(path)

export default defineEventHandler((event: H3Event) => {
  if (event.method !== 'GET') return
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/dict') || skip(pathname)) return
  const base = useRuntimeConfig(event).apiBase as string
  void fetch(`${base}/api/dict/visit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: pathname, ua: getRequestHeader(event, 'user-agent') ?? '', ref: getRequestHeader(event, 'referer') ?? '' }),
    signal: AbortSignal.timeout(2_000),
  }).catch(() => undefined)
})
