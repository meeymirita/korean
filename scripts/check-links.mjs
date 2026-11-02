/**
 * Обход сайта по ссылкам: headless Chromium открывает страницу, собирает ссылки и идёт по ним дальше (только свой сайт).
 * На каждой странице ищет: 404 «Такой страницы нет», битые картинки, файлы и запросы с ошибкой (4xx/5xx, не загрузилось).
 * Запуск (сайт уже открыт: дев-сервер, `vite preview` или боевой адрес):
 *   node scripts/check-links.mjs                                   — http://localhost:5198, только открытые страницы
 *   BASE=https://korean.meeymirita.ru node scripts/check-links.mjs — боевой сайт
 *   TOKEN=токен-демо-сервера node scripts/check-links.mjs          — с закрытыми страницами (токен демо-сервера, не владельца)
 * Переменные: BASE, TOKEN, START (адреса для начала через запятую, по умолчанию / и всё из public/sitemap.xml), MAX (страниц, 300),
 * WAIT (мс на страницу, 1500), EXTERNAL=1 (проверить и внешние ссылки), CHROME (путь к браузеру), DEBUG.
 * Печатает только найденные ошибки и строку «checked N»; код выхода 1, если есть ошибки. Нужен Node 24 (WebSocket).
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE = (process.env.BASE || 'http://localhost:5198').replace(/\/$/, '')
const TOKEN = process.env.TOKEN
const MAX = Number(process.env.MAX || 300)
const WAIT = Number(process.env.WAIT || 1500)
const PORT = 9334

/** Браузер: CHROME, иначе Chromium из кэша Playwright на Mac, иначе chromium / google-chrome из PATH. */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const mac = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'
  if (existsSync(mac)) return mac
  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim()
    } catch { /* нет такого */ }
  }
  console.error('Не найден Chromium: задайте CHROME=путь'); process.exit(2)
}

/** Начальные адреса: / и всё из sitemap.xml (на своём BASE). */
function startPaths() {
  if (process.env.START) return process.env.START.split(',')
  const xml = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
  return ['/', ...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)]
}

// порт занят (браузер от прошлого запуска): иначе подключимся к нему, а не к своему
if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false)) {
  console.error(`Порт ${PORT} занят другим браузером: закройте его (curl -s 127.0.0.1:${PORT}/json/version) и запустите снова`); process.exit(2)
}
const chrome = findChrome()
// Chromium из snap (Linux) пишет только в свою папку ~/snap/chromium/common
const profileRoot = chrome.startsWith('/snap/') ? path.join(process.env.HOME, 'snap/chromium/common') : tmpdir()
const profile = mkdtempSync(path.join(profileRoot, 'check-links-'))
const ch = spawn(chrome, ['--headless', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
ch.on('error', e => { console.error('Chromium не запустился:', e.message); rmSync(profile, { recursive: true, force: true }); process.exit(2) })
/** Закрывает браузер командой Browser.close (она работает только на уровне всего браузера, не вкладки). */
async function closeBrowser() {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    const bws = new WebSocket(webSocketDebuggerUrl)
    await new Promise((r, e) => { bws.onopen = r; bws.onerror = e })
    bws.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 250)); try { await fetch(`http://127.0.0.1:${PORT}/json/version`) } catch { return } }
  } catch { /* уже закрыт */ }
}
const finish = async code => {
  // Chromium из snap не принимает сигналы от чужого процесса: закрываем его командой, kill на всякий случай
  await closeBrowser()
  try { ch.kill() } catch { /* уже закрыт */ }
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) // браузер ещё дописывает профиль
  process.exit(code)
}
let targets
for (let i = 0; i < 40 && !targets; i++) {
  await new Promise(r => setTimeout(r, 250))
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json() } catch { /* браузер ещё запускается */ }
}
if (!targets) { console.error('Chromium не запустился'); ch.kill(); rmSync(profile, { recursive: true, force: true }); process.exit(2) }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))

const DEBUG = process.env.DEBUG
let id = 0
const pend = new Map()
const urls = new Map() // requestId → адрес (loadingFailed присылает только requestId)
let failed = [] // запросы текущей страницы с ошибкой: { url, why }
ws.onmessage = m => {
  const d = JSON.parse(m.data)
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return }
  if (d.method === 'Network.requestWillBeSent') urls.set(d.params.requestId, d.params.request.url)
  if (d.method === 'Network.responseReceived') {
    const { url, status } = d.params.response
    // API отвечает 4xx по своей логике (без токена 401, выключенная визитка 404): ошибкой считаем только 5xx
    if (url.includes('/api/') ? status >= 500 : status >= 400) failed.push({ url, why: String(status) })
  }
  if (d.method === 'Network.loadingFailed' && !d.params.canceled && d.params.type !== 'Media') failed.push({ url: urls.get(d.params.requestId) || '?', why: d.params.errorText })
  if (DEBUG && d.method === 'Runtime.exceptionThrown') console.log('PAGE', JSON.stringify(d.params).slice(0, 300))
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = ms => new Promise(r => setTimeout(r, ms))

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')

if (TOKEN) {
  await send('Page.navigate', { url: BASE + '/nope' }); await sleep(800)
  await ev(`localStorage.setItem('progress_token', ${JSON.stringify(TOKEN)}); localStorage.setItem('progress_verified','1'); localStorage.setItem('progress_role','owner')`)
}

const origin = new URL(BASE).origin
const key = u => u.pathname.replace(/\/$/, '') + u.search || '/' // одна страница = путь + ?параметры, без #якоря
const queue = startPaths().map(p => ({ url: new URL(p, BASE), from: '(старт)' }))
const seen = new Set(queue.map(q => key(q.url)))
const external = new Map() // адрес → откуда ссылка
const problems = []

while (queue.length && seen.size - queue.length < MAX) {
  const { url, from } = queue.shift()
  failed = []
  await send('Page.navigate', { url: url.href }); await sleep(WAIT)
  const page = await ev(`(() => ({
    notFound: !!document.querySelector('main.nf'),
    links: [...document.querySelectorAll('a[href]')].map(a => a.href),
    images: [...document.querySelectorAll('img')].filter(i => i.currentSrc && i.complete && i.naturalWidth === 0).map(i => i.currentSrc),
  }))()`)
  const where = `${key(url)} (ссылка с ${from})`
  if (!page) { problems.push(`${where}: страница не открылась`); continue }
  if (page.notFound) problems.push(`${where}: 404, такой страницы нет`)
  for (const src of page.images) problems.push(`${key(url)}: битая картинка ${src}`)
  for (const f of failed) problems.push(`${key(url)}: ${f.why} ${f.url}`)
  if (DEBUG) console.log(key(url), page.links.length, 'ссылок')
  if (page.notFound) continue // ссылки со страницы 404 одинаковые, их проверят с других страниц
  for (const href of page.links) {
    let u
    try { u = new URL(href) } catch { continue }
    if (!/^https?:$/.test(u.protocol)) continue // mailto:, tel:
    if (u.origin !== origin) { if (!external.has(u.href)) external.set(u.href, key(url)); continue }
    if (/\.\w{2,5}$/.test(u.pathname)) { // файл, а не страница: проверяем, что он есть
      if (!seen.has(u.pathname)) { seen.add(u.pathname); const r = await fetch(u.href, { method: 'HEAD' }).catch(() => null); if (!r?.ok) problems.push(`${key(url)}: файл ${u.pathname} → ${r?.status ?? 'нет ответа'}`) }
      continue
    }
    u.hash = ''
    if (!seen.has(key(u))) { seen.add(key(u)); queue.push({ url: u, from: key(url) }) }
  }
}

if (process.env.EXTERNAL === '1') {
  for (const [href, from] of external) {
    const r = await fetch(href, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) }).catch(e => ({ ok: false, status: e.name }))
    // некоторые сайты не отвечают на HEAD (405) или закрыты от роботов (403): переспрашиваем обычным GET
    const ok = r.ok || ((r.status === 405 || r.status === 403) && (await fetch(href, { signal: AbortSignal.timeout(10_000) }).catch(() => ({ ok: false }))).ok)
    if (!ok) problems.push(`${from}: внешняя ссылка ${href} → ${r.status}`)
  }
}

for (const p of [...new Set(problems)]) console.log(p)
console.log('checked', seen.size - queue.length, 'pages,', external.size, 'external links' + (process.env.EXTERNAL === '1' ? ' (проверены)' : ' (не проверялись, EXTERNAL=1)'))
await finish(problems.length ? 1 : 0)
