import { START_LOCATION, createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { applySeo } from '@/data/seo'
import { lastRefTab } from '@/data/korean/sections'
import RichView from '@/views/korean/RichView.vue'

const rich = (id: 'cheat' | 'talk' | 'hangul' | 'reading' | 'numbers') => ({
  path: id,
  component: RichView,
  props: { id },
})

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
window.addEventListener('scroll', () => {
  if (restoring) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ ...readScroll(), [router.currentRoute.value.path]: Math.round(window.scrollY) }))
    } catch {
      /* без запоминания */
    }
  }, 150)
}, { passive: true })

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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/korean',
      component: () => import('@/views/korean/KoreanLayout.vue'),
      redirect: '/korean/home',
      children: [
        { path: 'home', component: () => import('@/views/korean/OverviewView.vue') },
        { path: 'today', meta: { private: true }, component: () => import('@/views/korean/TodayView.vue') },
        { path: 'cabinet', meta: { private: true }, component: () => import('@/views/korean/CabinetView.vue') },
        { path: 'progress', redirect: '/korean/cabinet' },
        { path: 'words', component: () => import('@/views/korean/WordsView.vue') },
        { path: 'grammar', component: () => import('@/views/korean/GrammarView.vue') },
        {
          path: 'ref',
          component: () => import('@/views/korean/ReferenceView.vue'),
          redirect: () => `/korean/ref/${lastRefTab()}`,
          children: [
            rich('cheat'),
            rich('talk'),
            rich('hangul'),
            { path: 'alphabet', component: () => import('@/views/korean/AlphabetView.vue') },
            rich('reading'),
            { path: 'sentences', component: () => import('@/views/korean/SentencesView.vue') },
            rich('numbers'),
          ],
        },
        ...['cheat', 'talk', 'hangul', 'alphabet', 'reading', 'sentences', 'numbers'].map(id => ({
          path: id,
          redirect: `/korean/ref/${id}`,
        })),
        { path: 'trainers', meta: { private: true }, component: () => import('@/views/korean/TrainersView.vue') },
        { path: 'garden', meta: { private: true }, component: () => import('@/views/korean/GardenView.vue') },
        { path: 'review', meta: { private: true }, component: () => import('@/views/korean/ReviewView.vue') },
      ],
    },
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
    { path: '/me', name: 'me', component: () => import('@/views/PublicMeView.vue') },
    { path: '/history', name: 'history', component: () => import('@/views/HistoryView.vue') },
    { path: '/game', name: 'game', component: () => import('@/views/GameView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (from === START_LOCATION) {
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
})
router.afterEach(to => applySeo(to.path))

export default router
