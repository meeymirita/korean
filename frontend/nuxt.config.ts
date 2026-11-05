/**
 * Nuxt: сайт рисуется на сервере (SSR), API остаётся в NestJS (backend/, порт 3001).
 * Открытые страницы (src/data/seo.ts без noindex) отрисовываются при сборке и отдаются готовым HTML,
 * закрытые токеном работают как приложение в браузере (ssr: false): токен лежит в localStorage, серверу его не видно.
 * Запуск: npm run dev (порт 3000, /api проксируется на API_PORT, по умолчанию 3001), npm run build, npm run preview.
 */
import { BRAND, SITE, indexablePaths, privatePaths } from './src/data/seo'

const API = process.env.API_BASE || `http://${process.env.API_HOST || '127.0.0.1'}:${process.env.API_PORT || 3001}`
const pub = indexablePaths()
const priv = privatePaths()

/**
 * Открытые страницы, которые одинаковы для всех: готовый HTML при сборке. Остальные открытые рисуются на каждый запрос:
 * /me берёт визитку из API, на главных случайные фраза, правило и слова (новые после каждого обновления, useHomePicks).
 */
const PER_REQUEST = ['/me', '/', '/korean/home']
const STATIC = pub.filter(p => !PER_REQUEST.includes(p))

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  srcDir: 'src',
  // backend/ в корне — это NestJS (API), а не серверная часть Nuxt: своих серверных маршрутов у Nuxt нет
  serverDir: 'src/nitro',
  // @/ → src/ (как было в Vite); public/ Nuxt берёт из корня проекта сам
  devtools: { enabled: false },
  telemetry: false,
  modules: ['@pinia/nuxt', '@nuxtjs/robots', '@nuxtjs/sitemap', 'nuxt-schema-org'],
  css: ['@/assets/main.css'],
  // в проекте везде явные import: свои папки не подключаем автоматически (встроенные useRoute, useSeoMeta, computed и т. п. остаются)
  imports: { scan: false },
  components: { dirs: [] },
  pinia: { storesDirs: [] },

  site: { url: SITE, name: BRAND, defaultLocale: 'ru' },

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1.0',
      meta: [
        { name: 'theme-color', content: '#fbf8ff' },
        { name: 'yandex-verification', content: '7e91f055e8c3fe9f' },
        { name: 'color-scheme', content: 'light' },
        { name: 'format-detection', content: 'telephone=no' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: BRAND },
        { property: 'og:locale', content: 'ru_RU' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Главная страница платформы 우리말' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
      script: [
        // тёмная тема до отрисовки, чтобы страница не мигала светлой (src/lib/theme.ts)
        { innerHTML: 'try{var m=localStorage.getItem("theme_mode");if(m==="dark"||m==="night"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark";if(m==="night")document.documentElement.dataset.palette="night"}catch(e){}', tagPosition: 'head' },
      ],
    },
  },

  routeRules: {
    ...Object.fromEntries(STATIC.map(p => [p, { prerender: true }])),
    // визитка: из кэша Nitro (в памяти процесса) до 60 с, потом обновляется в фоне; как прежний Cache-Control у /api/public/me
    '/me': { swr: 60 },
    // закрытые страницы и всё, что зависит от localStorage: только в браузере
    ...Object.fromEntries(priv.map(p => [p, { ssr: false }])),
    '/korean/ref': { ssr: false },
    // локальная проверка собранного сайта (npm run preview) без Caddy: /api уходит в NestJS; на боевом сервере /api раньше перехватывает Caddy
    '/api/**': { proxy: `${API}/api/**` },
    // заголовки безопасности для страниц сайта (API ставит свои сам, backend/src/security.ts)
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  },

  robots: {
    // как раньше в public/robots.txt: визитка и её картинка открыты, остальное API и закрытые страницы нет
    groups: [{ userAgent: '*', allow: ['/', '/api/public/'], disallow: ['/api/', '/game', ...priv] }],
  },
  sitemap: {
    urls: pub,
    // /korean и /korean/ref только перенаправляют на страницу раздела
    exclude: [...priv, '/korean', '/korean/ref'],
  },
  schemaOrg: {
    identity: { type: 'Organization', name: BRAND, url: SITE },
  },

  runtimeConfig: {
    // куда SSR ходит за данными API (визитка /me); в браузере запросы идут на /api того же сайта
    apiBase: API,
  },

  nitro: {
    preset: 'node-server',
    devProxy: { '/api': { target: `${API}/api`, changeOrigin: true } },
    prerender: { crawlLinks: false, routes: STATIC },
  },

  vite: {
    build: {
      rolldownOptions: {
        // справка «плагины работали N с» на каждой сборке: пользы нет
        checks: { bundlerTimings: false },
      },
    },
  },

  // строгие индексы, как было в tsconfig.app.json: arr[i] может быть undefined
  typescript: { typeCheck: false, tsConfig: { compilerOptions: { noUncheckedIndexedAccess: true } } },
})
