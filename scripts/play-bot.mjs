/**
 * Бот-игрок, уровень B (docs/bot.md): открывает каждый режим игры «Хлебушек» в настоящем Chromium без окна, проходит каждый чип уровня
 * и играет как человек (верно, неверно, 70% верно, случайно, только клавиатура, перетаскивание плиток). Без новых пакетов: протокол браузера по WebSocket (Node 24+).
 *
 * Нужен сайт, собранный или запущенный с NUXT_PUBLIC_TEST_HOOKS=1 (крючок window.__gameProbe отдаёт бот-у задание и счётчики; в боевой сборке его нет)
 * и сервер с токеном. Самое простое: `NUXT_PUBLIC_TEST_HOOKS=1 bash scripts/local-demo.sh`, токен local-demo-token-2026.
 *
 *   TOKEN=local-demo-token-2026 node scripts/play-bot.mjs
 *
 * Переменные: BASE (http://localhost:5198), TOKEN, THEME=light|wine, SIZE=desktop|phone, GUEST=1 (без токена), MODES=word,part (по умолчанию все из кода),
 * STEPS (заданий на клетку «режим × подрежим», 10), STRATEGY=right|wrong|mix70|random|keys|drag|all (all: по кругу), MECHANICS=1 (блиц, выживание, подсказки, «Обновить вопрос», перезагрузка),
 * OUT (папка отчёта, по умолчанию ./bot-report), SHOTS=1 (скриншот на каждое нарушение), PORT (порт отладки Chromium, 9344), DEBUG=1.
 * Код выхода 1, если нашлись нарушения. Один браузер, всё по очереди: ноутбук слабый.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://localhost:5198'
const GUEST = process.env.GUEST === '1'
const TOKEN = process.env.TOKEN
if (!TOKEN) {
  console.error('Задайте TOKEN=токен демо-сервера (не боевой); с GUEST=1 бот сам выпишет гостевой токен на час и отзовёт его в конце')
  process.exit(2)
}
const THEME = process.env.THEME || 'light'
const SIZE = process.env.SIZE || 'desktop'
const STEPS = Number(process.env.STEPS || 10)
const STRATEGY = process.env.STRATEGY || 'all'
const MECHANICS = process.env.MECHANICS === '1'
const OUT = process.env.OUT || 'bot-report'
const PORT = Number(process.env.PORT || 9344)
const DEBUG = !!process.env.DEBUG
const ONLY = process.env.MODES ? process.env.MODES.split(',') : null
const STRATEGIES = ['right', 'wrong', 'mix70', 'random', 'keys', 'drag']
const ALLOW = existsSync(new URL('./play-bot-allow.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('./play-bot-allow.json', import.meta.url), 'utf8')) : { console: [], network: [] }
const allowed = (list, text) => list.some(r => new RegExp(r, 'u').test(text))
mkdirSync(OUT, { recursive: true })

/** GUEST=1: гостевой токен выписывается владельцем (повторный ввод токена в X-Confirm-Token) и в конце отзывается. */
let guest = null
if (GUEST) {
  const r = await fetch(`${BASE}/api/guests`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'x-confirm-token': TOKEN }, body: JSON.stringify({ hours: 1, label: 'бот-игрок' }) })
  guest = await r.json()
  if (!guest.token) { console.error('Не вышло выписать гостевой токен:', r.status, JSON.stringify(guest).slice(0, 200)); process.exit(2) }
}
async function revokeGuest() {
  if (guest?.id) await fetch(`${BASE}/api/guests/${guest.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN}` } }).catch(() => {})
}
/* ---------- Chromium ---------- */
function findChrome() {
  for (const root of [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]) {
    if (!existsSync(root)) continue
    for (const d of readdirSync(root).filter(x => x.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of readdirSync(join(root, d))) {
        const p = join(root, d, sub, 'chrome-headless-shell')
        if (existsSync(p)) return p
      }
    }
  }
  throw new Error('Не нашёл chrome-headless-shell в кэше Playwright')
}
const chrome = spawn(findChrome(), [`--remote-debugging-port=${PORT}`, '--no-sandbox', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
await sleep(1500)
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let msgId = 0
const pending = new Map()
/** Всё, что браузер сообщил с начала клетки: ошибки консоли, исключения, плохие ответы сети. */
let events = []
const requests = new Map()
const guestWrites = []
ws.onmessage = m => {
  const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) return pending.get(d.id)(d), pending.delete(d.id)
  const p = d.params
  if (d.method === 'Runtime.exceptionThrown') events.push({ kind: 'исключение', text: p.exceptionDetails?.exception?.description || p.exceptionDetails?.text })
  else if (d.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) events.push({ kind: 'консоль-' + p.type, text: p.args.map(a => a.value ?? a.description ?? '').join(' ') })
  else if (d.method === 'Log.entryAdded' && (p.entry.level === 'error' || p.entry.level === 'warning')) events.push({ kind: 'журнал-' + p.entry.level, text: p.entry.text + ' ' + (p.entry.url || '') })
  else if (d.method === 'Network.requestWillBeSent') requests.set(p.requestId, { url: p.request.url, method: p.request.method })
  else if (d.method === 'Network.responseReceived') {
    const r = requests.get(p.requestId)
    if (p.response.status >= 400) events.push({ kind: 'сеть-' + p.response.status, text: (r?.method || '') + ' ' + p.response.url })
    if (GUEST && r && r.method !== 'GET' && /\/api\/progress/.test(r.url) && p.response.status < 300) guestWrites.push(r.url)
  } else if (d.method === 'Network.loadingFailed' && !p.canceled) events.push({ kind: 'сеть-упала', text: (requests.get(p.requestId)?.url || '') + ' ' + p.errorText })
}
const send = (method, params = {}) => new Promise(r => { const i = ++msgId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async expr => {
  const r = (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result
  if (r?.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  return r?.result?.value
}
for (const d of ['Page', 'Runtime', 'Network', 'Log']) await send(d + '.enable')
if (SIZE === 'phone') {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 2, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })
} else await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

/* ---------- страница ---------- */
async function setup() {
  await send('Page.navigate', { url: BASE + '/nope' })
  await sleep(900)
  await ev(`localStorage.clear(); localStorage.setItem('theme_mode', '${THEME}');
    localStorage.setItem('progress_token','${GUEST ? guest.token : TOKEN}'); localStorage.setItem('progress_verified','1'); localStorage.setItem('progress_role','${GUEST ? 'guest' : 'owner'}')`)
}
async function openMode(mode) {
  await send('Page.navigate', { url: `${BASE}/game/home?game=${mode}` })
  for (let i = 0; i < 80; i++) {
    await sleep(150)
    if (await ev(`!!(window.__gameProbe && window.__gameProbe.question() && document.querySelector('#card'))`)) break
  }
  if (!(await ev('!!window.__gameProbe'))) throw new Error('нет window.__gameProbe: сайт запущен без NUXT_PUBLIC_TEST_HOOKS=1 или игра не открылась')
  await ev(`document.querySelector('#helpOk')?.click()`)
}
const probeQ = () => ev('window.__gameProbe.question()')
const probeS = () => ev('window.__gameProbe.state()')

/* ---------- ответы ---------- */
const clickJs = sel => `document.querySelector(${JSON.stringify(sel)})?.click()`
async function press(key) {
  const code = /^\d$/.test(key) ? 'Digit' + key : key
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, text: type === 'keyDown' && key.length === 1 ? key : undefined, windowsVirtualKeyCode: key === 'Enter' ? 13 : key.charCodeAt(0) })
}
async function dragTo(fromSel, toSel) {
  const pt = await ev(`(() => { const a = document.querySelector(${JSON.stringify(fromSel)}), b = document.querySelector(${JSON.stringify(toSel)}); if (!a || !b) return null
    a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(), t = b.getBoundingClientRect()
    return { x1: r.left + r.width / 2, y1: r.top + r.height / 2, x2: t.left + t.width / 2, y2: t.top + t.height / 2 } })()`)
  if (!pt) return false
  if (SIZE === 'phone') {
    // на телефоне перетаскивают пальцем: события касания
    const tp = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    await tp('touchStart', pt.x1, pt.y1)
    for (let i = 1; i <= 8; i++) await tp('touchMove', pt.x1 + ((pt.x2 - pt.x1) * i) / 8, pt.y1 + ((pt.y2 - pt.y1) * i) / 8)
    await tp('touchEnd')
    await sleep(60)
    return true
  }
  const ev1 = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
  await ev1('mouseMoved', pt.x1, pt.y1)
  await ev1('mousePressed', pt.x1, pt.y1)
  for (let i = 1; i <= 8; i++) await ev1('mouseMoved', pt.x1 + ((pt.x2 - pt.x1) * i) / 8, pt.y1 + ((pt.y2 - pt.y1) * i) / 8)
  await ev1('mouseReleased', pt.x2, pt.y2)
  await sleep(60)
  return true
}
/** Выбирает, верным ли будет ответ в этом шаге: right / wrong и как отвечать. */
function plan(strategy, step, rng) {
  if (strategy === 'right' || strategy === 'keys' || strategy === 'drag') return true
  if (strategy === 'wrong') return false
  if (strategy === 'mix70') return rng() < 0.7
  return rng() < 0.5
}

/** Отвечает на задание; возвращает, сколько верных и неверных ответов должен засчитать счёт. */
async function answer(q, wantRight, how) {
  if (q.type === 'choice') {
    const bad = q.options.map((_, i) => i).filter(i => i !== q.correct)
    const i = wantRight ? q.correct : bad[Math.floor(Math.random() * bad.length)]
    if (how === 'keys') await press(String(i + 1))
    else await ev(`document.querySelectorAll('#opts .opt')[${i}]?.click()`)
    return { ok: wantRight ? 1 : 0, bad: wantRight ? 0 : 1 }
  }
  if (q.type === 'type') {
    if (wantRight) {
      await ev(`(() => { const i = document.querySelector('#tinp'); i.value = ${JSON.stringify(q.answers[0])}; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.tform button[type=submit]').click() })()`)
    } else await ev(`[...document.querySelectorAll('.acts button')].find(b => b.textContent.includes('Не знаю')).click()`)
    return { ok: wantRight ? 1 : 0, bad: wantRight ? 0 : 1 }
  }
  if (q.type === 'build') {
    const words = (wantRight ? q.accept[0] : '').split(/\s+/).filter(Boolean)
    if (!wantRight) await ev(`document.querySelector('#tiles .tile')?.click()`)
    else if (how === 'drag') {
      for (const w of words) {
        const idx = await ev(`(() => { const t = [...document.querySelectorAll('#tiles .tile')].findIndex(b => !b.classList.contains('used') && !b.disabled && b.childNodes[0].textContent === ${JSON.stringify(w)}); return t })()`)
        const n0 = await ev(`document.querySelector('#slots').children.length`)
        if (idx >= 0) await dragTo(`#tiles .tile[data-i="${idx}"]`, '#slots')
        if (idx < 0 || (await ev(`document.querySelector('#slots').children.length`)) <= n0) await ev(`document.querySelectorAll('#tiles .tile')[${idx}]?.click()`)
      }
    } else {
      for (const w of words) await ev(`(() => { const t = [...document.querySelectorAll('#tiles .tile')].find(b => !b.classList.contains('used') && !b.disabled && b.childNodes[0].textContent === ${JSON.stringify(w)}); t?.click() })()`)
    }
    if (how === 'keys') await press('Enter')
    else await ev(clickJs('#chk'))
    return { ok: wantRight ? 1 : 0, bad: wantRight ? 0 : 1, build: true }
  }
  if (q.type === 'story') {
    let ok = 0
    for (let k = 0; k < q.gaps.length; k++) {
      const g = q.gaps[k]
      const right = wantRight || Math.random() < 0.5
      if (g.input) {
        await ev(`(() => { const i = document.querySelector('#sg${k}'); i.value = ${JSON.stringify(right ? g.right : 'ㅋ')}; i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      } else {
        const want = right ? g.right : q.bank.find(t => t !== g.right && !(g.accept || []).includes(t)) ?? q.bank[0]
        const label = `[...document.querySelectorAll('#bank .tile')].findIndex(b => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('') === ${JSON.stringify(want)})`
        const bi = await ev(label)
        if (bi >= 0) {
          if (how === 'drag') {
            // библиотека перетаскивания грузится лениво: если сразу после отрисовки плитка не встала, это не ошибка человека, ставим нажатием
            await dragTo(`#bt${bi}`, `#sg${k}`)
            if (!(await ev(`document.querySelector('#sg${k}')?.textContent.trim() !== ''`))) { await ev(clickJs('#bt' + bi)); await ev(clickJs('#sg' + k)) }
          } else { await ev(clickJs('#bt' + bi)); await ev(clickJs('#sg' + k)) }
        }
      }
      const exp = await ev(`(() => { const q = window.__gameProbe.question(); return q ? 1 : 0 })()`)
      void exp
      if (right) ok++
    }
    // перетаскивание иногда не доходит до пропуска (редко, не воспроизводится по заказу): человек бы просто нажал, и бот докладывает пропуски нажатием; сам факт попадает в предупреждения
    if (how === 'drag') {
      const empty = await ev(`(window.__gameProbe.question()?.gaps || []).map((g, i) => (g.picked === null && !g.input ? i : -1)).filter(i => i >= 0)`)
      for (const k of empty) {
        const g = q.gaps[k]
        const bi = await ev(`[...document.querySelectorAll('#bank .tile')].findIndex(b => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('') === ${JSON.stringify(g.right)})`)
        if (bi >= 0) { await ev(clickJs('#bt' + bi)); await ev(clickJs('#sg' + k)) }
      }
      if (empty.length) warnings.push({ cell: currentCell, code: 'перетаскивание-не-дошло', detail: `${empty.length} из ${q.gaps.length} пропусков не заполнились перетаскиванием, добавлены нажатием` })
    }
    await ev(clickJs('#schk'))
    return { ok, bad: q.gaps.length - ok, story: true }
  }
  throw new Error('неизвестный тип задания ' + q.type)
}

/* ---------- проверки ---------- */
const violations = []
let currentCell = ''
async function shot(name) {
  if (!process.env.SHOTS) return undefined
  const s = await send('Page.captureScreenshot', { format: 'png' })
  const f = join(OUT, `${name.replace(/[^a-z0-9а-я]+/gi, '_')}_${Date.now()}.png`)
  writeFileSync(f, Buffer.from(s.result.data, 'base64'))
  return f
}
/** Предупреждения не роняют прогон: контраст оформления решает владелец (дизайн не меняем сами). Каждый вид один раз за прогон. */
const warnings = []
const warnSeen = new Set()
async function violation(code, detail, extra = {}) {
  if (code === 'контраст-ниже-4.5') {
    const k = String(detail).replace(/ «.*$/, '').replace(/\d\.\d+/, m => Math.round(m * 10) / 10)
    if (!warnSeen.has(k)) { warnSeen.add(k); warnings.push({ cell: currentCell, code, detail: String(detail) }) }
    return
  }
  const v = { cell: currentCell, code, detail: String(detail).slice(0, 400), theme: THEME, size: SIZE, guest: GUEST, ...extra }
  v.shot = await shot(`${currentCell}_${code}`)
  violations.push(v)
  if (DEBUG) console.log('НАРУШЕНИЕ', JSON.stringify(v))
}
async function flushEvents(context) {
  const list = events.splice(0)
  for (const e of list) {
    const bucket = e.kind.startsWith('сеть') ? ALLOW.network : ALLOW.console
    if (allowed(bucket, e.text || '')) continue
    await violation(e.kind, e.text, { context })
  }
}
const PAGE_CHECKS = `(() => {
  const out = []
  const doc = document.documentElement
  if (doc.scrollWidth > doc.clientWidth + 1) out.push(['горизонтальная-прокрутка', doc.scrollWidth + ' > ' + doc.clientWidth])
  const area = document.querySelector('#cardWrap') || document.body
  for (const el of area.querySelectorAll('.opt, .tile, .gap, .chip, button')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || el.getBoundingClientRect().width === 0) continue
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible') out.push(['обрезанный-текст', (el.className || el.tagName) + ': ' + el.textContent.slice(0, 40)])
    if (!el.disabled && !(el.textContent.trim() || el.getAttribute('aria-label') || el.getAttribute('title'))) out.push(['кнопка-без-подписи', el.className || el.tagName])
  }
  for (const img of document.querySelectorAll('#cardWrap img, .gx-body img')) if (img.complete && img.naturalWidth === 0 && img.src) out.push(['картинка-не-загрузилась', img.src.slice(-60)])
  // карточка «?» в «Как собрано»: слово не найдено в словаре
  for (const c of document.querySelectorAll('#fb .bd-card')) if ((c.querySelector('.bd-g')?.textContent || '').trim() === '?') out.push(['карточка-со-знаком-вопроса', c.textContent.slice(0, 40)])
  const bad = /undefined|\\bNaN\\b|\\[object Object\\]/
  const t = document.querySelector('#cardWrap')?.innerText || ''
  if (bad.test(t)) out.push(['мусор-на-экране', (t.match(bad) || [''])[0]])
  if (/[\\u3040-\\u30ff\\u4e00-\\u9fff]/.test(t)) out.push(['японские-китайские-знаки', t.match(/[\\u3040-\\u30ff\\u4e00-\\u9fff]+/)[0]])
  return out
})()`
const COLOR_SCAN = `(() => {
  // «Розовая»: нет зелёного, синего, фиолетового; допустимы розовые, золотое «верно» и коралловое «ошибка»
  const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\\/]+/).map(Number); return a < 0.2 ? null : [r, g, b] }
  const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
    if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, s, l] }
  const bad = new Set()
  for (const el of document.querySelectorAll('#cardWrap *, .gx-actions *, .gx-body .card *, #list *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none') continue
    for (const p of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) {
      if (p.startsWith('border') && parseFloat(cs.borderTopWidth) === 0) continue
      const c = parse(cs[p]); if (!c) continue
      const [h, s, l] = hsl(c)
      if (s > 0.25 && l > 0.12 && l < 0.92 && ((h >= 85 && h <= 175) || (h >= 195 && h <= 300))) bad.add((el.className && el.className.baseVal === undefined ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' ' + p + ' ' + cs[p])
    }
  }
  return [...bad].slice(0, 8)
})()`
const CONTRAST = `(() => {
  const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,\\/]+/).map(Number); return { r, g, b, a } }
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const bg = el => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; if (getComputedStyle(e).backgroundImage !== 'none') return null } return { r: 255, g: 255, b: 255, a: 1 } }
  const bad = []
  for (const el of document.querySelectorAll('#cardWrap .opt .t, #cardWrap .prompt, #cardWrap .label, #cardWrap .tile, #cardWrap .story-s, #cardWrap .ruline, #cardWrap button')) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
    if (!own || getComputedStyle(el).display === 'none') continue
    const fg = parse(getComputedStyle(el).color), b = bg(el); if (!fg || !b) continue
    const a = lum(fg), c = lum(b), ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)
    const size = parseFloat(getComputedStyle(el).fontSize), big = size >= 24 || (size >= 18.66 && Number(getComputedStyle(el).fontWeight) >= 700)
    if (ratio < (big ? 3 : 4.5)) bad.push((el.className || el.tagName).toString().split(' ')[0] + ' ' + ratio.toFixed(2) + ' «' + el.textContent.trim().slice(0, 24) + '»')
  }
  return [...new Set(bad)].slice(0, 6)
})()`
async function pageChecks(context) {
  for (const [code, detail] of (await ev(PAGE_CHECKS)) || []) await violation(code, detail, { context })
  if (THEME === 'wine') for (const d of (await ev(COLOR_SCAN)) || []) await violation('цвет-не-из-палитры', d, { context })
  for (const d of (await ev(CONTRAST)) || []) await violation('контраст-ниже-4.5', d, { context })
}

/* ---------- один шаг, одна клетка ---------- */
const stats = new Map() // клетка → { tasks, violations, ms[] }
/** Играет `steps` заданий; сверяет счётчики и разбор после каждого ответа. */
async function playSteps(steps, strategy, label) {
  const rng = Math.random
  const cell = stats.get(currentCell) || stats.set(currentCell, { tasks: 0, bad: 0, ms: [], strategies: new Set() }).get(currentCell)
  for (let i = 0; i < steps; i++) {
    const q = await probeQ()
    if (!q) { await violation('нет-задания', `шаг ${i}`); return }
    const before = await probeS()
    const how = strategy === 'keys' ? 'keys' : strategy === 'drag' ? 'drag' : 'click'
    const wantRight = plan(strategy, i, rng)
    let res
    const vBefore = violations.length
    try { res = await answer(q, wantRight, how) } catch (e) { await violation('сбой-ответа', e.message, { key: q.key }); return }
    await sleep(40)
    const after = await probeS()
    const stuck = !(await ev(`document.querySelector('#fb')?.classList.contains('show') || document.querySelector('#fb')?.childNodes.length > 0`))
    if (stuck) {
      // для текстов с пропусками показываем, что стоит в пропусках: так видно, какой не заполнился (перетаскивание, нажатие)
      const picked = q.type === 'story' ? await ev(`(window.__gameProbe.question()?.gaps || []).map((g, i) => i + ':' + (g.picked ?? '∅'))`) : null
      await violation('нет-разбора-после-ответа', `${q.key}${picked ? ' · пропуски ' + picked.join(' ') : ''}`, { key: q.key, json: JSON.stringify(q).slice(0, 600) })
    }
    const dOk = after.ses.ok - before.ses.ok, dBad = after.ses.bad - before.ses.bad
    if (!res.build && (dOk !== res.ok || dBad !== res.bad)) await violation('счётчик-не-сошёлся', `ждали +${res.ok}/+${res.bad}, стало +${dOk}/+${dBad}`, { key: q.key })
    if (res.build && dOk + dBad !== 1) await violation('счётчик-не-сошёлся', `сборка дала +${dOk}/+${dBad}`, { key: q.key })
    if (!res.build && !res.story && res.bad && after.ses.streak !== 0) await violation('серия-не-сбросилась', String(after.ses.streak), { key: q.key })
    if (after.all.ok < before.all.ok || after.all.bad < before.all.bad) await violation('счётчик-за-всё-время-убыл', JSON.stringify([before.all, after.all]), { key: q.key })
    const shown = await ev(`({ ok: +document.querySelector('#nOk')?.textContent, bad: +document.querySelector('#nBad')?.textContent })`)
    if (shown.ok !== after.ses.ok || shown.bad !== after.ses.bad) await violation('экран-не-совпал-со-счётчиком', `экран ${shown.ok}/${shown.bad}, игра ${after.ses.ok}/${after.ses.bad}`, { key: q.key })
    if (q.type === 'choice') {
      const nOk = await ev(`document.querySelectorAll('#opts .opt.ok').length`)
      if (nOk !== 1) await violation('верных-вариантов-на-экране-не-один', String(nOk), { key: q.key })
    }
    if (i === 0 || vBefore !== violations.length) await pageChecks(label)
    await flushEvents(label)
    cell.tasks++
    cell.strategies.add(strategy)
    // следующее задание и время его отрисовки
    const key = q.key
    const ms = await ev(`(() => { const b = document.querySelector('#nextBtn'); if (!b) return -1; const t = performance.now(); b.click(); return performance.now() - t })()`)
    if (ms < 0) {
      if (how === 'keys') await press('Enter')
      else { await violation('нет-кнопки-дальше', q.key); return }
    }
    if (ms >= 0) cell.ms.push(ms)
    const nq = await probeQ()
    if (nq && nq.key === key && !nq.retry) await sleep(60)
  }
  cell.bad = violations.filter(v => v.cell === currentCell).length
}

/** Нажимает чип уровня и проверяет, что выбор принят, а размер задания совпал с названием чипа. */
async function pickLevel(mode, lvl, index) {
  const chips = await ev(`(() => { const row = document.querySelector('#card .levels:not(.fams)'); return row ? [...row.querySelectorAll('.chip')].map(c => c.textContent) : [] })()`)
  if (chips[index] !== lvl.label) {
    await violation('чип-уровня-не-найден', `ждали «${lvl.label}», на экране ${JSON.stringify(chips)}`)
    return false
  }
  await ev(`document.querySelectorAll('#card .levels:not(.fams) .chip')[${index}].click()`)
  await sleep(100)
  const st = await probeS()
  if (st.levels[mode] !== lvl.id) await violation('уровень-не-запомнился', `${st.levels[mode]} вместо ${lvl.id}`)
  const on = await ev(`[...document.querySelector('#card .levels:not(.fams)').querySelectorAll('.chip.on')].map(c => c.textContent)`)
  if (on.length !== 1 || on[0] !== lvl.label) await violation('чип-on-не-тот', JSON.stringify(on))
  const q = await probeQ()
  const sizes = { story: [2, 4], long: [5, 10], expert: [8, 12] }
  const range = mode === 'spot' ? { story: [2, 3], long: [4, 5] }[lvl.id] : sizes[lvl.id]
  if (q.type === 'story' && range && !['expert', 'han'].includes(mode) && (q.sents.length < range[0] || q.sents.length > range[1])) await violation('размер-текста-вне-чипа', `${q.sents.length} предложений, чип «${lvl.label}»`, { key: q.key })
  if (mode === 'expert') {
    const want = { simple: 5, story: 10, long: 15 }[lvl.id]
    const dom = await ev(`document.querySelectorAll('#card .story .gap, #card .story .gap-in').length`)
    if (q.gaps.length !== want || dom !== want) await violation('пропусков-не-столько-сколько-в-чипе', `в данных ${q.gaps.length}, на экране ${dom}, чип ждёт ${want}`)
  }
  return true
}

/* ---------- механики ---------- */
async function mechanics(mode) {
  currentCell = `${mode}/механики`
  const cell = stats.set(currentCell, { tasks: 0, bad: 0, ms: [], strategies: new Set() }).get(currentCell)
  // «Обновить вопрос»
  const k1 = (await probeQ()).key
  await ev(clickJs('#refreshBtn')); await sleep(80)
  if (!(await probeQ())) await violation('обновить-вопрос-сломал-игру', k1)
  // подсказка 50/50
  const q = await probeQ()
  if (q.type === 'choice' && q.options.length > 2) {
    await ev(clickJs('#hintBtn')); await sleep(60)
    const dim = await ev(`document.querySelectorAll('#opts .opt.dim').length`)
    if (dim !== 2) await violation('50/50-убрала-не-два-варианта', String(dim))
    const st = await probeS()
    if (st.hints !== 2) await violation('50/50-не-списалась', String(st.hints))
  }
  // перезагрузка посреди раунда: настройки живут, игра открывается
  await playSteps(3, 'right', 'перед-перезагрузкой')
  const was = await probeS()
  await openMode(mode)
  const now = await probeS()
  if (now.all.ok < was.all.ok) await violation('статистика-пропала-после-перезагрузки', `${was.all.ok} → ${now.all.ok}`)
  if (JSON.stringify(now.levels) !== JSON.stringify(was.levels)) await violation('уровень-не-вернулся-после-перезагрузки', JSON.stringify([was.levels, now.levels]))
  // выживание: отвечаем неверно, пока не кончатся жизни
  await ev(clickJs('#survBtn')); await sleep(200)
  for (let i = 0; i < 12; i++) {
    const over = await ev(`document.querySelector('#over')?.classList.contains('on')`)
    if (over) break
    const q2 = await probeQ()
    if (!q2) break
    try { await answer(q2, false, 'click') } catch { break }
    await sleep(80)
    await ev(`document.querySelector('#nextBtn')?.click()`)
    await sleep(80)
  }
  if (!(await ev(`document.querySelector('#over')?.classList.contains('on')`))) await violation('выживание-не-закончилось', 'после 12 неверных ответов нет итога')
  else await ev(clickJs('#overClose'))
  await sleep(100)
  // блиц: 30 секунд до нуля
  await ev(`(() => { const s = document.querySelector('#blitzSecs'); if (s) { s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true })) } })()`)
  await ev(clickJs('#blitzBtn')); await sleep(200)
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    if (await ev(`document.querySelector('#over')?.classList.contains('on')`)) break
    const q3 = await probeQ()
    if (q3 && !(await ev('window.__gameProbe.state().answered'))) { try { await answer(q3, true, 'click') } catch { /* окно итога могло закрыть задание */ } }
    await sleep(120)
  }
  if (!(await ev(`document.querySelector('#over')?.classList.contains('on')`))) await violation('блиц-не-закончился', 'за 45 секунд нет итога')
  else {
    const big = await ev(`document.querySelector('#overBig')?.textContent`)
    const st = await probeS()
    if (!big) await violation('в-итоге-блица-пусто', 'нет числа')
    void st
    await ev(clickJs('#overClose'))
  }
  await flushEvents('механики')
  cell.bad = violations.filter(v => v.cell === currentCell).length
  cell.tasks = Math.max(cell.tasks, 1)
}

/* ---------- тренажёры (TaskSession): серия «вопрос → варианты» ---------- */
/** Открывает `?game=<id>` и определяет, что это: режим «Хлебушка» (`__gameProbe`), серия заданий (`__taskProbe`) или другой экран. */
async function kindOf(id) {
  await send('Page.navigate', { url: `${BASE}/game/home?game=${id}` })
  for (let i = 0; i < 40; i++) {
    await sleep(150)
    const k = await ev(`window.__taskProbe && window.__taskProbe.task() ? 'task' : window.__gameProbe && window.__gameProbe.question() ? 'engine' : ''`)
    if (k) return k
  }
  return 'other'
}
async function playTool(id, steps, strategy) {
  const cell = stats.get(currentCell) || stats.set(currentCell, { tasks: 0, bad: 0, ms: [], strategies: new Set() }).get(currentCell)
  for (let i = 0; i < steps; i++) {
    const t = await ev('window.__taskProbe.task()')
    if (!t) break
    const before = await ev('window.__taskProbe.state()')
    const wantRight = strategy === 'wrong' ? false : strategy === 'mix70' ? Math.random() < 0.7 : strategy === 'random' ? Math.random() < 0.5 : true
    const others = t.options.filter(o => o !== t.answer)
    const pick = wantRight ? t.answer : others[Math.floor(Math.random() * others.length)]
    const idx = t.options.indexOf(pick)
    if (strategy === 'keys') await press(String(idx + 1))
    else await ev(`document.querySelectorAll('.rs-opts .rs-opt')[${idx}]?.click()`)
    await sleep(60)
    // «Второй шанс» у владельца без предметов не предлагается; если окно есть, оставляем ответ
    await ev(`[...document.querySelectorAll('.rs-chance .rs-item.soft')].forEach(b => b.click())`)
    const nOk = await ev(`document.querySelectorAll('.rs-opts .rs-opt.ok').length`)
    if (nOk !== 1) await violation('верных-вариантов-на-экране-не-один', String(nOk), { key: `task:${t.id}` })
    const after = await ev('window.__taskProbe.state()')
    if (wantRight && !before.missed && after.right !== before.right + 1 && !(after.finished)) await violation('верный-ответ-не-засчитан', `${before.right} → ${after.right}`, { key: `task:${t.id}` })
    if (!wantRight && after.right !== before.right) await violation('неверный-ответ-засчитан', `${before.right} → ${after.right}`, { key: `task:${t.id}` })
    if (i === 0) await pageChecks(currentCell)
    await flushEvents(currentCell)
    cell.tasks++
    cell.strategies.add(strategy)
    const ms = await ev(`(() => { const b = document.querySelector('.rs-next'); if (!b) return -1; const t0 = performance.now(); b.click(); return performance.now() - t0 })()`)
    if (ms < 0) { await violation('нет-кнопки-дальше', `task:${t.id}`); return }
    cell.ms.push(ms)
    if (await ev('window.__taskProbe.state().finished')) break
  }
  const st = await ev('window.__taskProbe.state()')
  if (st.finished) {
    const end = await ev(`document.querySelector('.rs-end')?.innerText || ''`)
    if (!new RegExp(`${st.right}\\s*из\\s*${st.size}`).test(end)) await violation('итог-серии-не-совпал', `в игре ${st.right} из ${st.size}, на экране «${end.replace(/\s+/g, ' ').slice(0, 60)}»`)
  }
  cell.bad = violations.filter(v => v.cell === currentCell).length
}

/* ---------- прогон ---------- */
await setup()
await openMode('word')
events = []
const modes = (await ev('window.__gameProbe.modes()')).filter(m => !ONLY || ONLY.includes(m.id))
console.log(`Режимов в коде: ${modes.length}; тема ${THEME}, экран ${SIZE}${GUEST ? ', гость' : ''}; заданий на клетку ${STEPS}`)
const table = []
let strategyTurn = 0
for (const m of modes) {
  if (m.id === 'weak') continue
  const levels = m.levels.length ? m.levels : [{ id: 'simple', label: '' }]
  const row = { mode: m.id, name: m.name, cells: [] }
  let first = true
  for (let li = 0; li < levels.length; li++) {
    const lvl = levels[li]
    currentCell = `${m.id}/${lvl.label || 'Простой'}`
    try {
      if (first || li > 0) await openMode(m.id)
      first = false
      if (m.levels.length && !(await pickLevel(m.id, lvl, li))) { row.cells.push(currentCell); continue }
      const strategy = STRATEGY === 'all' ? STRATEGIES[strategyTurn++ % STRATEGIES.length] : STRATEGY
      await playSteps(STEPS, strategy, `${currentCell}:${strategy}`)
      // build: ещё четыре сложности («Простой» … «Мастер»)
      if (m.id === 'build' && lvl.id === 'simple') {
        const names = await ev(`[...document.querySelectorAll('#card .levels')].pop()?.querySelectorAll('.chip').length`)
        for (let d = 1; d < (names || 0); d++) {
          currentCell = `build/сложность ${d}`
          await ev(`[...document.querySelectorAll('#card .levels')].pop().querySelectorAll('.chip')[${d}].click()`)
          await sleep(100)
          await playSteps(STEPS, 'right', `${currentCell}:right`)
          row.cells.push(currentCell)
        }
      }
    } catch (e) {
      await violation('сбой-клетки', e.message)
    }
    row.cells.push(currentCell)
  }
  if (MECHANICS && ['word', 'part', 'build', 'pair'].includes(m.id)) {
    try { await openMode(m.id); await mechanics(m.id); row.cells.push(currentCell) } catch (e) { await violation('сбой-механик', e.message) }
  }
  table.push(row)
}
// тренажёры: id берутся из каталога на странице игр (ссылки ?game=...), тип определяется открытием
if (!ONLY) {
  await send('Page.navigate', { url: `${BASE}/game/home` })
  await sleep(2500)
  const ids = [...new Set(await ev(`[...document.querySelectorAll('a[href*="game="]')].map(a => new URL(a.href).searchParams.get('game')).filter(Boolean)`))]
  const engineIds = new Set(modes.map(m => m.id))
  let turn = 0
  for (const id of ids.filter(x => !engineIds.has(x))) {
    currentCell = `${id}/тренажёр`
    try {
      const kind = await kindOf(id)
      const strategy = STRATEGY === 'all' ? ['right', 'wrong', 'mix70', 'random', 'keys'][turn++ % 5] : STRATEGY
      const cell = stats.set(currentCell, { tasks: 0, bad: 0, ms: [], strategies: new Set() }).get(currentCell)
      if (kind === 'task') await playTool(id, STEPS, strategy)
      else { cell.tasks = 1; cell.strategies.add('открыт'); await pageChecks(currentCell); await flushEvents(currentCell) }
    } catch (e) { await violation('сбой-тренажёра', e.message) }
  }
}
if (GUEST && guestWrites.length) await violation('гость-записал-на-сервер', guestWrites.slice(0, 3).join(' '))

/* ---------- отчёт ---------- */
const lines = []
const cellRows = [...stats.entries()]
const msAll = cellRows.flatMap(([, c]) => c.ms)
const avg = msAll.length ? msAll.reduce((a, b) => a + b, 0) / msAll.length : 0
const sorted = [...msAll].sort((a, b) => a - b)
lines.push(`# Отчёт бота-игрока`, '', `Тема: ${THEME}; экран: ${SIZE}; ${GUEST ? 'гость' : 'владелец (токен демо-сервера)'}; заданий на клетку: ${STEPS}; стратегия: ${STRATEGY}.`, '',
  `Режимов в коде: ${modes.length}. Клеток «режим × подрежим»: ${cellRows.length}. Заданий сыграно: ${cellRows.reduce((a, [, c]) => a + c.tasks, 0)}. **Нарушений: ${violations.length}.**`,
  `Отрисовка следующего задания: среднее ${avg.toFixed(1)} мс, 95-й процентиль ${(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1)} мс (порог 100 мс).`, '',
  '| Режим | Подрежим | Заданий | Нарушений | Стратегии |', '|---|---|---|---|---|')
for (const [cell, c] of cellRows) {
  const [mode, ...rest] = cell.split('/')
  lines.push(`| ${mode} | ${rest.join('/')} | ${c.tasks || '**пусто**'} | ${violations.filter(v => v.cell === cell).length} | ${[...c.strategies].join(', ')} |`)
  if (!c.tasks) violations.push({ cell, code: 'клетка-пустая', detail: 'подрежим не пройден' })
}
if (avg > 100) violations.push({ cell: 'все', code: 'медленная-отрисовка', detail: `среднее ${avg.toFixed(1)} мс` })
const byCode = new Map()
for (const v of violations) byCode.set(v.code, (byCode.get(v.code) || 0) + 1)
lines.push('', '## Предупреждения (не роняют прогон)', '', ...(warnings.length ? warnings.map(w => `- ${w.code}: ${w.detail} (впервые: ${w.cell})`) : ['нет']))
lines.push('', '## Нарушения по видам', '', ...[...byCode].map(([c, n]) => `- ${c}: ${n}`))
lines.push('', '## Подробно', '', ...violations.map(v => `- **${v.cell}** · ${v.code}: ${v.detail}${v.key ? ` (задание ${v.key})` : ''}${v.shot ? ` · ${v.shot}` : ''}`))
const name = `report-${THEME}-${SIZE}${GUEST ? '-guest' : ''}`
writeFileSync(join(OUT, name + '.md'), lines.join('\n') + '\n')
writeFileSync(join(OUT, name + '.json'), JSON.stringify({ THEME, SIZE, GUEST, STEPS, violations, cells: Object.fromEntries(cellRows.map(([k, c]) => [k, { tasks: c.tasks }])) }, null, 2))
writeFileSync(join(OUT, name + '.html'), `<!doctype html><meta charset="utf-8"><title>Бот-игрок</title><style>body{font:14px system-ui;margin:24px}td,th{border:1px solid #ccc;padding:4px 8px}table{border-collapse:collapse}.bad{background:#fde}</style><pre>${lines.join('\n').replace(/</g, '&lt;')}</pre>`)
console.log(lines.slice(0, 5).join('\n'))
console.log(`Нарушений: ${violations.length}; отчёт: ${join(OUT, name + '.md')}`)
await revokeGuest()
chrome.kill()
ws.close()
process.exit(violations.length ? 1 : 0)
