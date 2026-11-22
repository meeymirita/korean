// Закрытые токеном страницы: единый список для tests/seo.test.mjs и tests/nuxt-ssr.test.mjs (раньше он был набран в обоих и расходился).
// Новая закрытая страница (`definePageMeta({ private: true })` + запись в seo.ts): допиши её сюда один раз.
export const PRIVATE_PATHS = [
  '/game/home', '/korean/cabinet', '/korean/chat', '/korean/clip', '/korean/culture', '/korean/exam', '/korean/forms', '/korean/garden', '/korean/grammar',
  '/korean/know', '/korean/lab', '/korean/map', '/korean/marks', '/korean/mistakes', '/korean/ref/alphabet', '/korean/ref/cheat', '/korean/ref/hangul', '/korean/ref/numbers',
  '/korean/ref/reading', '/korean/ref/sentences', '/korean/ref/talk', '/korean/report', '/korean/review', '/korean/vlog', '/korean/vlog-study', '/korean/services', '/korean/shop', '/korean/sites',
  '/korean/talks', '/korean/today', '/korean/topik', '/korean/words', '/upload',
]
