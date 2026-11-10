// Переходы внутри словаря без перезагрузки страницы (слово → слово, словарь → подборка) серверная часть не видит: сообщаем о них сами.
// Первый заход на страницу учитывает сервер (nitro/middleware/dict-visit.ts), поэтому здесь только последующие.
// Владелец после входа по токену получает метку `own=1` в cookie: с ней ни сервер, ни этот плагин его заходы не считают.
import { watch } from 'vue'
import type { Pinia } from 'pinia'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

const YEAR = 365 * 24 * 3600

export default defineNuxtPlugin(nuxtApp => {
  const router = useRouter()
  const progress = useProgressStore(nuxtApp.$pinia as Pinia)
  const owner = () => progress.unlocked && !progress.isGuest
  watch(owner, on => {
    document.cookie = `own=${on ? 1 : ''}; path=/; max-age=${on ? YEAR : 0}; SameSite=Lax`
  }, { immediate: true })
  router.afterEach((to, from) => {
    if (!from.matched.length || to.path === from.path || !to.path.startsWith('/dict') || owner()) return
    void fetchT('/dict-visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: to.path }),
      keepalive: true,
    }).catch(() => undefined)
  })
})
