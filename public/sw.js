/* Сервис-воркер: сайт открывается без сети. Запросы к /api не трогаем: прогресс живёт в браузере и досылается на сервер, когда сеть вернётся.
   Страницы: сначала сеть, при её отсутствии последняя сохранённая копия. Файлы /assets/ (в имени хеш сборки): из кэша, при первом заходе докачиваются.
   Поменял логику: подними VERSION, старый кэш удалится сам. */
const VERSION = 'v1'
const CACHE = 'urimal-' + VERSION

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('urimal-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    // любая страница сайта отдаёт один и тот же index.html (SPA), поэтому в запасе держим его
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            void caches.open(CACHE).then(c => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/').then(r => r || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webp|woff2?|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok) {
              const copy = res.clone()
              void caches.open(CACHE).then(c => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
