// Сообщает API о заходе на страницу словаря. Адрес /api/dict/visit принимает запросы только изнутри (от этой серверной части сайта),
// поэтому User-Agent и источник берутся из настоящего запроса посетителя, а не из того, что он прислал в теле.
// Свои заходы владельца не считаются: после входа по токену браузер ставит метку `own=1` (plugins/dict-visits.client.ts).
import { getRequestHeader, parseCookies, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'

export const OWNER_COOKIE = 'own'

export function reportDictVisit(event: H3Event, path: string, ref = getRequestHeader(event, 'referer') ?? '') {
  if (!path.startsWith('/dict') || parseCookies(event)[OWNER_COOKIE] === '1') return
  const base = useRuntimeConfig(event).apiBase as string
  void fetch(`${base}/api/dict/visit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path.slice(0, 300), ua: getRequestHeader(event, 'user-agent') ?? '', ref }),
    signal: AbortSignal.timeout(2_000),
  }).catch(() => undefined)
}
