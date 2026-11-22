/**
 * Запуск в браузере (раньше src/main.ts): тема, вход по токену и картинки, заменённые владельцем.
 * Только в браузере: токен и настройки лежат в localStorage, на сервере их нет.
 */
import type { Pinia } from 'pinia'
import { initSiteImages } from '@/lib/siteImagesDom'
import { initTheme, themeHydrated } from '@/lib/theme'
import { useProgressStore } from '@/stores/progress'
import { useSiteImagesStore } from '@/stores/siteImages'

export default defineNuxtPlugin(nuxtApp => {
  const pinia = nuxtApp.$pinia as Pinia
  const router = useRouter()
  initTheme()
  nuxtApp.hook('app:mounted', themeHydrated)
  // PWA убрано (решение владельца 2026-11-22: приложение есть на Mac, Electron): у кого сервис-воркер уже стоял, снимаем его и чистим кэши
  if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => void r.unregister()))
  if ('caches' in window) void caches.keys().then(ks => ks.forEach(k => void caches.delete(k)))

  /** Ссылка вида /?guest=токен входит сразу как гость; сам токен после входа убирается из адреса. */
  const guest = new URLSearchParams(location.search).get('guest')
  if (guest) {
    void router.isReady().then(() => {
      const { guest: _token, ...query } = router.currentRoute.value.query
      return router.replace({ query, hash: router.currentRoute.value.hash })
    })
  }

  const progress = useProgressStore(pinia)
  const start = () => {
    progress.restore()
    // владельца ссылка не трогает: его токен остаётся
    if (guest && !progress.unlocked) void progress.connect(guest)
    else void progress.init()
  }
  // готовая с сервера страница сначала оживает в том же виде («без входа»), потом подставляется сохранённый вход
  if (nuxtApp.isHydrating) nuxtApp.hook('app:suspense:resolve', start)
  else start()

  // картинки, которые владелец заменил в режиме редактирования: видны всем посетителям
  nuxtApp.hook('app:mounted', () => {
    initSiteImages(pinia)
    void useSiteImagesStore(pinia).load()
  })
})
