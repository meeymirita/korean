// Учёт заходов на большой словарь и подборки: на каждый запрос страницы /dict... серверная часть сайта сообщает об этом API
// (backend/src/dict/dict.visits.service.ts). Работает до кэша Nitro, поэтому видны и заходы поисковых роботов, и страницы из кэша.
// Ошибки учёта молча игнорируются: страница от них не зависит.
import { defineEventHandler, getRequestURL, type H3Event } from 'h3'
import { reportDictVisit } from '../utils/dictVisit'

const skip = (path: string) => path.endsWith('_payload.json') || path.startsWith('/_nuxt') || /\.(png|jpe?g|webp|svg|ico|css|js|map|txt|xml|json)$/i.test(path)

export default defineEventHandler((event: H3Event) => {
  if (event.method !== 'GET') return
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/dict') || skip(pathname)) return
  reportDictVisit(event, pathname)
})
