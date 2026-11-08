// Переходы внутри словаря без перезагрузки страницы (слово → слово, словарь → подборка) серверная часть не видит: сообщаем о них сами.
// Первый заход на страницу учитывает сервер (nitro/middleware/dict-visit.ts), поэтому здесь только последующие.
import { fetchT } from '@/lib/http'

export default defineNuxtPlugin(nuxtApp => {
  const router = useRouter()
  router.afterEach((to, from) => {
    if (!from.matched.length || to.path === from.path || !to.path.startsWith('/dict')) return
    void fetchT('/api/dict/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: to.path, ua: navigator.userAgent, ref: '' }),
      keepalive: true,
    }).catch(() => undefined)
  })
  void nuxtApp
})
