// Предварительная отрисовка для SEO: после `vite build` для каждой открытой страницы создаётся готовый HTML
// (свой <title>, описание, canonical, Open Graph и настоящее содержимое: слова, правила, справочники), который роботы видят без JavaScript.
// Vue при запуске заменяет эту заготовку живым приложением. Без новых пакетов: данные грузит сам Vite в режиме SSR, браузер не нужен.
// Переменные: TEMPLATE (откуда брать index.html, по умолчанию dist/index.html), OUT_DIR (куда писать, по умолчанию dist).
import { createServer } from 'vite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = process.env.OUT_DIR || path.join(root, 'dist')
const templatePath = process.env.TEMPLATE || path.join(outDir, 'index.html')
if (!existsSync(templatePath)) {
  console.error('prerender: нет ' + templatePath + ' (сначала vite build)')
  process.exit(1)
}
const template = readFileSync(templatePath, 'utf8')

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }
globalThis.window ??= globalThis

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@': root + 'src' } },
})
const load = p => server.ssrLoadModule(p)
const { SITE, BRAND, seoFor, indexablePaths } = await load('/src/data/seo.ts')
const { D, SE, CATN } = await load('/src/data/korean/words.ts')
const { G } = await load('/src/data/korean/grammar.ts')
const { blk } = await load('/src/data/korean/render.ts')
const pages = await load('/src/data/korean/pages.ts')
const { groups } = await load('/src/data/alphabet.ts')
const { ABOUT_SLIDES } = await load('/src/data/about.ts')
const { HISTORY } = await load('/src/data/history.ts')
const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
/** Метки цвета из данных ({o|…}) в чистый текст. */
const plain = s => String(s ?? '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '')

const NAV = [
  ['/', 'Главная'],
  ['/about', 'О платформе'],
  ['/history', 'История изменений'],
  ['/korean/words', 'Словарь'],
  ['/korean/grammar', 'Грамматика'],
  ['/korean/ref/cheat', 'Шпаргалка'],
  ['/korean/ref/talk', 'Разговорник'],
  ['/korean/ref/hangul', 'Хангыль'],
  ['/korean/ref/alphabet', 'Алфавит'],
  ['/korean/ref/reading', 'Правила чтения'],
  ['/korean/ref/sentences', 'Примеры предложений'],
  ['/korean/ref/numbers', 'Числа и счёт'],
]

const H1 = {
  '/': 'Тихое пространство для корейского',
  '/about': 'О платформе',
  '/history': 'История изменений',
  '/korean/home': 'Поиск по корейскому',
  '/korean/words': 'Корейский словарь',
  '/korean/grammar': 'Корейская грамматика',
  '/korean/ref/cheat': 'Шпаргалка по корейскому',
  '/korean/ref/talk': 'Корейский разговорник',
  '/korean/ref/hangul': 'Хангыль',
  '/korean/ref/alphabet': 'Корейский алфавит',
  '/korean/ref/reading': 'Правила чтения',
  '/korean/ref/sentences': 'Примеры предложений',
  '/korean/ref/numbers': 'Числа и счёт',
}

/** Содержимое страницы: то же, что видит человек, только как простой HTML. */
const BODY = {
  '/': () =>
    `<p>Слова, грамматика, справочник и игры в одном мягком кабинете. Маленькие шаги каждый день приводят к большой уверенности.</p>
     <ul>${NAV.slice(1).map(([p, t]) => `<li><a href="${p}">${esc(t)}</a></li>`).join('')}</ul>`,
  '/about': () => ABOUT_SLIDES.map(s => `<section><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></section>`).join(''),
  '/history': () => HISTORY.map(e => `<section><h2>${esc(e.title)}</h2><p><time datetime="${esc(e.date)}">${esc(e.date)}</time> · ${esc(e.summary)}</p><ul>${e.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join(''),
  '/korean/home': () => `<p>Один поиск по словарю, грамматике, справочнику, примерам и буквам корейского.</p>`,
  '/korean/words': () =>
    Object.entries(CATN).map(([id, name]) => `<span>${esc(name)}</span>`).join(' · ') +
    `<table><thead><tr><th>Корейский</th><th>Чтение</th><th>Перевод</th><th>Пример</th></tr></thead><tbody>${D.map(
      w => `<tr><td lang="ko">${esc(w.k)}</td><td>${esc(w.r)}</td><td>${esc(w.t)}</td><td lang="ko">${esc(w.s)}</td></tr>`,
    ).join('')}</tbody></table>`,
  '/korean/grammar': () =>
    G.map(
      g => `<article id="${esc(g.id)}"><h2 lang="ko">${esc(plain(g.ko))}</h2><p><b>${esc(plain(g.ru))}</b> · ${esc(g.s)}${g.l ? ' · ' + esc(g.l) : ''}</p><p>${esc(g.d)}</p>${g.b.map(blk).join('')}</article>`,
    ).join(''),
  '/korean/ref/cheat': () => pages.cheatHtml(),
  '/korean/ref/talk': () => pages.talkHtml(),
  '/korean/ref/hangul': () => pages.hangulHtml,
  '/korean/ref/reading': () => pages.readingHtml,
  '/korean/ref/numbers': () => pages.numbersHtml(),
  '/korean/ref/alphabet': () =>
    groups
      .map(
        g => `<section><h2>${esc(g.title)}</h2><p>${esc(g.note)}</p><ul>${g.letters.map(l => `<li><b lang="ko">${esc(l.char)}</b> — ${esc(l.reading)} (${esc(l.roman)})${l.hint ? ': ' + esc(l.hint) : ''}</li>`).join('')}</ul></section>`,
      )
      .join(''),
  '/korean/ref/sentences': () =>
    `<ol>${SE.map(w => `<li><span lang="ko">${esc(w.s)}</span>${TRANSLATIONS[w.s] ? ' — ' + esc(TRANSLATIONS[w.s]) : ''} <small>(${esc(w.k)}: ${esc(w.t)})</small></li>`).join('')}</ol>`,
}

const shell = p => {
  const s = seoFor(p)
  const nav = NAV.map(([href, t]) => `<a href="${href}">${esc(t)}</a>`).join(' · ')
  return `<div class="seo-shell"><header><a href="/"><b lang="ko">${esc(BRAND)}</b></a> <nav>${nav}</nav></header><main><h1>${esc(H1[p] ?? s.title)}</h1><p>${esc(s.description)}</p>${BODY[p]?.() ?? ''}</main><footer><p>${esc(BRAND)} — платформа для изучения корейского языка с нуля.</p></footer></div>`
}

/** Подставляет метатеги страницы в готовый index.html. */
function render(p) {
  const s = seoFor(p)
  const url = SITE + (p === '/' ? '/' : p)
  const sub = (re, tag) => (html = html.replace(re, () => tag))
  let html = template
  sub(/<title>[\s\S]*?<\/title>/, `<title>${esc(s.title)}</title>`)
  sub(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(s.description)}">`)
  sub(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}">`)
  sub(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}">`)
  sub(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(s.title)}">`)
  sub(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(s.description)}">`)
  sub(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(s.title)}">`)
  sub(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(s.description)}">`)
  sub(/<div id="app"><\/div>/, `<div id="app">${shell(p)}</div>`)
  return html
}

const written = []
for (const p of indexablePaths()) {
  const file = p === '/' ? path.join(outDir, 'index.html') : path.join(outDir, p, 'index.html')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, render(p))
  written.push(p)
}
await server.close()
console.log(`prerender: ${written.length} страниц (${written.join(', ')})`)
