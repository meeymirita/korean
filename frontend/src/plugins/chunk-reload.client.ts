/**
 * После выкладки у файлов сборки новые имена (с хешем), а открытая вкладка просит старые и получает
 * «Failed to fetch dynamically imported module». Тогда один раз перезагружаем страницу: она подтянет свежую сборку.
 * Метка в sessionStorage не даёт зациклиться, если сервер действительно лежит.
 */
const KEY = 'chunk_reload_at'

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* без sessionStorage перезагрузим один раз за запуск ниже */
  }
  location.reload()
}

export default defineNuxtPlugin(nuxtApp => {
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault()
    reloadOnce()
  })
  nuxtApp.hook('app:chunkError', () => reloadOnce())
})
