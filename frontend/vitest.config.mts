import { defineVitestConfig } from '@nuxt/test-utils/config'

// Тесты сайта в окружении Nuxt (@nuxt/test-utils): настоящие плагины, Pinia, роутер, автоимпорты.
// Сборку и работающий сервер Nuxt вместе с API проверяет tests/nuxt-ssr.test.mjs в корне репозитория.
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['test/**/*.spec.ts'],
    // игровые проверки гоняют сотни раундов: на медленном runner GitHub 5 секунд по умолчанию не хватает
    testTimeout: 30_000,
    environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
  },
})
