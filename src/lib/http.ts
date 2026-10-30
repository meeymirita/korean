/** Все запросы к серверу идут через fetchT: у каждого есть таймаут, зависший запрос не держит сайт. */
export const TIMEOUT = 15_000
/** Загрузка файла и скачивание картинки идут дольше. */
export const LONG_TIMEOUT = 120_000

export function fetchT(input: RequestInfo | URL, init: RequestInit = {}, ms = TIMEOUT): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  return fetch(input, { ...init, signal: init.signal ?? ctl.signal })
    .catch(e => {
      throw (e as Error)?.name === 'AbortError' ? new Error('сервер отвечает слишком долго') : e
    })
    .finally(() => clearTimeout(timer))
}
