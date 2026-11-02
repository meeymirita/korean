/** Все запросы к серверу идут через fetchT: у каждого есть таймаут, зависший запрос не держит сайт. */
export const TIMEOUT = 15_000
/** Загрузка файла и скачивание картинки идут дольше. */
export const LONG_TIMEOUT = 120_000

export function fetchT(input: RequestInfo | URL, init: RequestInit = {}, ms = TIMEOUT): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  return fetch(input, { ...init, signal: init.signal ?? ctl.signal })
    .catch(e => {
      throw (e as Error)?.name === 'AbortError' ? new Error('сервер не отвечает, попробуйте позже') : e
    })
    .finally(() => clearTimeout(timer))
}

/** Понятный текст ошибки запроса: «Failed to fetch» и подобное браузерное превращается в «сервер недоступен» или «нет интернета». */
export function errText(e: unknown): string {
  const m = (e as Error)?.message ?? ''
  if (/^(Failed to fetch|Load failed|NetworkError|Network request failed)/i.test(m))
    return typeof navigator !== 'undefined' && navigator.onLine === false ? 'нет интернета' : 'сервер недоступен'
  return m
}
