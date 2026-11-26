import { isOpenPath } from '@/lib/metrika'

/** Закрытые страницы прячутся от вебвизора Метрики (подробности в `lib/metrika.ts`): класс на `body` меняется при каждом переходе. */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const apply = (path: string) => document.body.classList.toggle('ym-hide-content', !isOpenPath(path))
  const keys = (path: string) => document.body.classList.toggle('ym-disable-keys', !isOpenPath(path))
  const both = (path: string) => { apply(path); keys(path) }
  both(location.pathname)
  router.afterEach(to => both(to.path))
})
