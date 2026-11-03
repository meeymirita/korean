/**
 * Настройки роутера Nuxt. Страницы берутся из src/pages (файловый роутинг), здесь только:
 * старые адреса, которые ведут на новые (игры переехали на /game/home, справочник на /korean/ref/…), и прокрутка после обновления страницы.
 */
import type { RouterConfig } from '@nuxt/schema'
import type { RouteRecordRaw } from 'vue-router'

const REF = ['cheat', 'talk', 'hangul', 'alphabet', 'reading', 'sentences', 'numbers']
const GAMES = ['quick', 'particles', 'pairs', 'translate', 'syllables', 'keyboard']

const redirects: RouteRecordRaw[] = [
  { path: '/korean/progress', redirect: '/korean/cabinet' },
  ...REF.map(id => ({ path: `/korean/${id}`, redirect: `/korean/ref/${id}` })),
  // игры переехали на /game/home: старые адреса ведут туда, выбранная игра в ?game=…
  { path: '/korean/trainers', redirect: to => ({ path: '/game/home', query: { ...to.query, game: 'match' } }) },
  ...GAMES.map(id => ({ path: `/korean/${id}`, redirect: { path: '/game/home', query: { game: id } } })),
  { path: '/game', redirect: to => ({ path: '/game/home', query: typeof to.query.mode === 'string' ? { game: to.query.mode } : {} }) },
  { path: '/game/play', redirect: to => ({ path: '/game/home', query: { game: typeof to.query.mode === 'string' ? to.query.mode : 'mix' } }) },
  ...['match', ...GAMES].map(id => ({ path: `/game/${id}`, redirect: { path: '/game/home', query: { game: id } } })),
]

/* ---------- прокрутка: после обновления страницы возвращаем туда же ---------- */
const SCROLL_KEY = 'ui_scroll'
const readScroll = (): Record<string, number> => {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}')
  } catch {
    return {}
  }
}
let restoring = true // пока страница не вернулась на своё место, положение не записываем
let saveTimer: ReturnType<typeof setTimeout> | undefined
if (import.meta.client) {
  window.addEventListener('scroll', () => {
    if (restoring) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ ...readScroll(), [location.pathname]: Math.round(window.scrollY) }))
      } catch {
        /* без запоминания */
      }
    }, 150)
  }, { passive: true })
}

/** Ждёт, пока страница станет достаточно высокой (данные и картинки подгружаются), и только потом прокручивает. */
const scrollWhenReady = (top: number) =>
  new Promise<{ top: number }>(resolve => {
    const t0 = performance.now()
    const tick = () => {
      const ready = document.documentElement.scrollHeight >= top + window.innerHeight || performance.now() - t0 > 2500
      if (ready) {
        restoring = false
        resolve({ top })
      } else requestAnimationFrame(tick)
    }
    tick()
  })

export default {
  routes: pages => [...pages, ...redirects],
  scrollBehavior(to, from, savedPosition) {
    if (!from.matched.length) {
      // первая загрузка или обновление страницы: возвращаемся на сохранённое место
      const y = readScroll()[to.path]
      if (y) return scrollWhenReady(y)
      restoring = false
      return { top: 0 }
    }
    restoring = false
    if (savedPosition) return savedPosition // «назад» и «вперёд» в браузере
    if (to.path === from.path) return false // сменился только ?параметр (вкладка кабинета): не прыгаем
    return { top: 0 }
  },
} satisfies RouterConfig
