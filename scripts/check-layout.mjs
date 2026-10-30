/**
 * Проверка вёрстки на узких экранах: открывает страницы в headless Chromium и ищет всё, что вылезает за край (горизонтальная прокрутка страницы).
 * Запуск (демо-сервер и дев-сервер описаны в CLAUDE.md, «Как проверять изменения»):
 *   TOKEN=токен-демо-сервера WIDTHS=320,390,768 node scripts/check-layout.mjs
 * Переменные: BASE (адрес сайта, по умолчанию http://localhost:5198), WIDTHS, ROUTES (через запятую), WAIT (мс на страницу), SHOTS (папка для скриншотов), DEBUG.
 * Ничего не печатает, если всё в порядке (кроме «checked N»). Нужен Node 24 (WebSocket) и Chromium из кэша Playwright.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const BASE = process.env.BASE || 'http://localhost:5198'
const TOKEN = process.env.TOKEN
if (!TOKEN) { console.error('Задайте TOKEN=токен демо-сервера (не токен владельца)'); process.exit(2) }
const widths = (process.env.WIDTHS || '360,768').split(',').map(Number)
const shots = process.env.SHOTS
const routes = (process.env.ROUTES || '/,/about,/history,/me,/game,/korean/home,/korean/today,/korean/words,/korean/grammar,/korean/ref/cheat,/korean/ref/talk,/korean/ref/hangul,/korean/ref/alphabet,/korean/ref/reading,/korean/ref/sentences,/korean/ref/numbers,/korean/trainers,/korean/review,/korean/garden,/korean/cabinet,/korean/cabinet?tab=repeat,/korean/cabinet?tab=week,/korean/cabinet?tab=history,/korean/cabinet?tab=notes,/korean/cabinet?tab=images,/korean/cabinet?tab=db,/korean/cabinet?tab=logs,/korean/cabinet?tab=settings,/nope').split(',')
const ch = spawn(CHROME, ['--remote-debugging-port=9333', '--no-sandbox', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 1500))
const targets = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0; const pend = new Map()
ws.onmessage = m => { const d = JSON.parse(m.data); if (process.env.DEBUG && (d.method === 'Runtime.exceptionThrown' || d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error')) console.log('PAGE', JSON.stringify(d.params).slice(0, 400)); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = ms => new Promise(r => setTimeout(r, ms))
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: BASE + '/nope' }); await sleep(800)
await ev(`localStorage.setItem('progress_token','${TOKEN}'); localStorage.setItem('progress_verified','1'); localStorage.setItem('progress_role','owner')`)
const out = []
for (const w of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 700 })
  for (const r of routes) {
    await send('Page.navigate', { url: BASE + r }); await sleep(Number(process.env.WAIT || 1300))
    const res = await ev(`(() => {
      const W = document.documentElement.clientWidth
      const bad = []
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        const cs = getComputedStyle(el)
        if (cs.position === 'fixed' && b.right <= W + 1) continue
        if (b.right > W + 2 || b.left < -2) {
          // игнорируем то, что внутри контейнера с собственной прокруткой
          let p = el.parentElement, scroll = false
          while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.getBoundingClientRect().right <= W + 2) { scroll = true; break } p = p.parentElement }
          if (!scroll) bad.push((el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) + ' ' + Math.round(b.left) + '..' + Math.round(b.right))
        }
      }
      return { sw: document.documentElement.scrollWidth, W, bad: [...new Set(bad)].slice(0, 6) }
    })()`)
    if (process.env.DEBUG) console.log(r, await ev('location.href + " | " + document.body.innerText.length + " | " + document.readyState'))
    out.push({ w, r, ...res })
    if (shots) { const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(`${shots}/${w}_${r.replace(/[^a-z0-9]+/gi, '_')}.png`, Buffer.from(s.result.data, 'base64')) }
  }
}
for (const o of out) if (o.sw > o.W || o.bad.length) console.log(o.w, o.r, 'scrollWidth', o.sw, '/', o.W, o.bad.join(' | '))
console.log('checked', out.length)
ch.kill(); ws.close(); process.exit(0)
