/**
 * Скриншоты для окна «Что здесь есть» (главная) и страницы «О платформе»: по одной картинке на каждую страницу и игру из
 * `data/guide.ts` и `data/about.ts` (имя файла считает `shotName`), в `frontend/src/assets/about/<имя>.webp` (1280×800).
 * Снимает только ДЕМО-сервер (не сервер владельца!): сначала `node scripts/demo-seed.mjs`, потом собранный сайт на этот сервер.
 * Запуск: TOKEN=токен-демо-сервера node scripts/about-shots.mjs
 * Переменные: BASE (адрес сайта, по умолчанию http://localhost:5198), ONLY=имя,имя (только эти), WAIT (мс на страницу, 2500), KEEP=1 (не удалять лишние файлы).
 * Нужны Node 24 (WebSocket), Chromium из кэша Playwright и `cwebp` (brew install webp). Кнопки плеера и таймера, плашки на кадр не попадают.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { close, load } from '../tests/_load.mjs'

const BASE = process.env.BASE || 'http://localhost:5198'
const TOKEN = process.env.TOKEN
if (!TOKEN) {
  console.error('Задайте TOKEN=токен демо-сервера (не токен владельца)')
  process.exit(2)
}
const WAIT = Number(process.env.WAIT || 2500)
const OUT = fileURLToPath(new URL('../frontend/src/assets/about/', import.meta.url))
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'

const { GAMES, PAGES, shotName } = await load('/src/data/guide.ts')
const { ABOUT_SLIDES } = await load('/src/data/about.ts')
await close()

/** адрес → имя файла; у адресов без своей страницы (блиц и выживание ведут на общую страницу игр) картинка одна */
const targets = new Map()
for (const to of ['/', ...GAMES.map(g => g.to), ...PAGES.map(p => p.to), ...ABOUT_SLIDES.map(s => s.to)]) targets.set(shotName(to), to)
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null
const list = [...targets].filter(([name]) => !only || only.has(name))

const ch = spawn(CHROME, ['--remote-debugging-port=9333', '--no-sandbox', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 1500))
const pages = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = m => {
  const d = JSON.parse(m.data)
  if (d.id && pend.has(d.id)) (pend.get(d.id)(d), pend.delete(d.id))
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = ms => new Promise(r => setTimeout(r, ms))

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: BASE + '/' })
await sleep(2500)
await ev(`localStorage.clear(); localStorage.setItem('progress_token', ${JSON.stringify(TOKEN)}); localStorage.setItem('progress_verified', '1'); localStorage.setItem('progress_role', 'owner'); sessionStorage.setItem('demo_auto_shown', '1')`)

const tmp = mkdtempSync(path.join(tmpdir(), 'about-shots-'))
const done = []
for (const [name, to] of list) {
  await send('Page.navigate', { url: BASE + to })
  await sleep(WAIT)
  // справка игры закрывается, плавающие кнопки и плашки прячутся
  await ev(`document.querySelector('#helpOk')?.click()`)
  await ev(`(() => { const s = document.createElement('style'); s.textContent = '.stm,.mp-root,.mp-panel,[class*="toast"]{display:none!important}'; document.head.appendChild(s) })()`)
  await sleep(600)
  const png = path.join(tmp, name + '.png')
  writeFileSync(png, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
  execFileSync('cwebp', ['-quiet', '-q', '72', '-m', '6', png, '-o', path.join(OUT, name + '.webp')])
  done.push(name)
  console.log(name, Math.round(statSync(path.join(OUT, name + '.webp')).size / 1024) + ' КБ')
}
ws.close()
ch.kill()
rmSync(tmp, { recursive: true, force: true })

if (!only && !process.env.KEEP) {
  const keep = new Set([...targets.keys()].map(n => n + '.webp'))
  for (const f of readdirSync(OUT)) if (f.endsWith('.webp') && !keep.has(f)) (rmSync(path.join(OUT, f)), console.log('удалён лишний', f))
}
console.log(`снято: ${done.length}`)
