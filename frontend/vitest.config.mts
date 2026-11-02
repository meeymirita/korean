import { defineVitestConfig } from '@nuxt/test-utils/config'

// Тесты сайта в окружении Nuxt (@nuxt/test-utils): настоящие плагины, Pinia, роутер, автоимпорты.
// Сборку и работающий сервер Nuxt вместе с API проверяет tests/nuxt-ssr.test.mjs в корне репозитория.
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['test/**/*.spec.ts'],
    environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
  },
})
