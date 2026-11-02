/**
 * Анимации всего сайта (GSAP, `lib/motion.ts`): появление страниц и карточек, окна, нажатия, плавающие картинки.
 * Первая отрисовка с сервера не анимируется (иначе готовый HTML мигал бы); дальше работает на каждой смене страницы.
 */
import { enterMenu, enterPage, initMotion, swapTab } from '@/lib/motion'

export default defineNuxtPlugin(nuxtApp => {
  const router = useRouter()
  let ready = false
  let prev = ''
  nuxtApp.hook('app:mounted', () => {
    initMotion()
    prev = router.currentRoute.value.path
    setTimeout(() => (ready = true), 150)
  })
  // вкладка кабинета или каталога игр сменилась (адрес тот же, меняется ?tab= или ?game=)
  router.afterEach((to, from) => {
    if (ready && from.path && to.path === from.path && to.fullPath !== from.fullPath) requestAnimationFrame(() => swapTab())
  })
  nuxtApp.hook('page:finish', () => {
    const path = router.currentRoute.value.path
    const from = prev
    prev = path
    if (!ready) return
    requestAnimationFrame(() => {
      enterPage()
      // в раздел корейского или в игры зашли с другого места: меню выезжает
      const sec = (p: string) => (p.startsWith('/korean') ? 'k' : p.startsWith('/game') ? 'g' : '')
      if (sec(path) && sec(path) !== sec(from)) enterMenu()
    })
  })
})
