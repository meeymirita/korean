/**
 * Собирает `frontend/src/assets/wine-components.css`: винно-розовый вариант светлых стилей страниц раздела, игры, кабинета и общих окон.
 * Берёт правила из `<style>` всех `.vue` и из основных `.css`, находит в них светлые и пастельные цвета (фоны, рамки, текст, тени)
 * и выдаёт копию правила с префиксом темы «Розовая» и с заменой цветов на винно-розовые. Светлая тема не меняется.
 * Открытые страницы (всё внутри `.pk`) в выдачу не попадают: у селекторов стоит `:not(.pk *)`.
 * Запуск: `node scripts/build-wine-components.mjs` (перезаписывает файл), `--check` (только проверка).
 * Тонкая ручная настройка лежит в `shell-pink.css`, он подключён позже и важнее этого файла.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const SRC = path.join(root, 'frontend/src')
const OUT = path.join(SRC, 'assets/wine-components.css')
const PREFIX = "html[data-theme='dark'][data-palette='wine']"

/** Файлы, у которых уже свой тёмно-розовый дизайн, или служебные. */
const SKIP = [
  'views/HomeView.vue', 'views/HomeLightView.vue', 'views/GrowthView.vue', 'views/AboutView.vue', 'views/HistoryView.vue', 'views/PublicMeView.vue', 'views/Dict', 'views/Ru',
  'components/site/', 'components/dict/', 'components/home/',
]
const CSS_FILES = ['assets/sky.css', 'assets/study.css', 'assets/cabinet.css', 'assets/garden.css', 'assets/breakdown.css']

/* ---------- цвета ---------- */
function parseColor(s) {
  s = s.trim().toLowerCase()
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4] }
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  return null
}
function hsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return { h: 0, s: 0, l }
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : mx === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60
  return { h, s, l }
}
const rgba = (r, g, b, a) => (a >= 1 ? `rgba(${r}, ${g}, ${b}, 1)` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(2)})`)
const pinkish = h => h >= 290 || h <= 25

function mapBg(c) {
  if (c.a === 0) return null
  const { h, s, l } = hsl(c)
  if (l >= 0.93) return rgba(255, 255, 255, c.a >= 0.9 ? 0.07 : Math.max(0.04, c.a * 0.08))
  if (l >= 0.78) return pinkish(h) && s > 0.2 ? rgba(255, 111, 174, 0.2) : rgba(255, 255, 255, 0.1)
  if (l >= 0.55) return s >= 0.25 ? rgba(255, 111, 174, c.a) : rgba(255, 255, 255, 0.14)
  if (l >= 0.3) return s >= 0.2 ? rgba(194, 24, 107, c.a) : null
  // тёмно-синие подложки окон (затемнение фона): в винное затемнение
  if (l < 0.3 && h >= 200 && h <= 280) return rgba(11, 5, 8, Math.max(c.a, 0.6))
  return l < 0.3 && c.a >= 0.5 ? rgba(42, 10, 24, c.a) : null
}
function mapText(c) {
  if (c.a === 0) return null
  const { s, l } = hsl(c)
  if (l < 0.28) return '#ffffff'
  if (l < 0.62) return '#ffd1e3'
  if (l < 0.8) return s >= 0.25 ? '#ff9cc6' : '#ffb3d1'
  return null
}
function mapBorder(c) {
  if (c.a === 0) return null
  const { s, l } = hsl(c)
  if (l >= 0.78) return 'rgba(255, 190, 220, 0.18)'
  if (l >= 0.5 && s >= 0.2) return 'rgba(255, 190, 220, 0.35)'
  return null
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/g
function mapColors(value, fn) {
  let changed = false
  const out = value.replace(COLOR_RE, m => {
    const c = parseColor(m)
    const r = c && fn(c)
    if (r) { changed = true; return r }
    return m
  })
  return changed ? out : null
}

/** Новое значение свойства или null, если менять нечего. */
function mapDecl(prop, value) {
  if (/^background(-color|-image)?$/.test(prop)) return mapColors(value, mapBg)
  if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === 'caret-color') return mapColors(value, mapText)
  if (/^border(-top|-right|-bottom|-left)?(-color)?$/.test(prop) || prop === 'outline' || prop === 'outline-color') return mapColors(value, mapBorder)
  if (prop === 'box-shadow') return /inset/.test(value) || value.trim() === 'none' ? null : 'none'
  if (prop === 'text-shadow') return value.trim() === 'none' ? null : 'none'
  return null
}

/* ---------- разбор CSS ---------- */
function splitTop(str, sep) {
  const out = []
  let depth = 0, cur = ''
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === sep && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, '') }

/** Разбирает блок на правила: { selector, body } и вложенные @media: { at, rules }. */
function parseBlock(css) {
  const items = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const head = css.slice(i, open).trim()
    let depth = 1, j = open + 1
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++ }
    const body = css.slice(open + 1, j - 1)
    if (head.startsWith('@media') || head.startsWith('@supports')) items.push({ at: head, rules: parseBlock(body) })
    else if (!head.startsWith('@')) items.push({ selector: head, body })
    i = j
  }
  return items
}

function prefixSelector(sel) {
  sel = sel.trim()
  if (!sel || /data-theme|^html|^:root|^body\b|^\*/.test(sel) || sel.includes(':deep(') || sel.includes(':global(') || sel.includes('@')) return null
  // :not(.pk *) ставим перед псевдоэлементом
  const pe = sel.search(/::/)
  const guard = ':where(:not(.pk *))' // нулевая специфичность: ручные правила shell-pink.css и wine.css важнее
  const withGuard = pe >= 0 ? sel.slice(0, pe) + guard + sel.slice(pe) : sel + guard
  return `${PREFIX} ${withGuard}`
}

function convertRule({ selector, body }) {
  const decls = splitTop(body, ';').map(d => d.trim()).filter(Boolean)
  const kept = []
  for (const d of decls) {
    const k = d.indexOf(':')
    if (k < 0) continue
    const prop = d.slice(0, k).trim().toLowerCase()
    let value = d.slice(k + 1).trim()
    value = value.replace(/\s*!important\s*$/, '')
    const mapped = mapDecl(prop, value)
    if (mapped) kept.push(`${prop}: ${mapped}`)
  }
  if (!kept.length) return ''
  const sels = splitTop(selector, ',').map(prefixSelector).filter(Boolean)
  if (!sels.length) return ''
  return `${sels.join(',\n')} { ${kept.join('; ')}; }\n`
}

function convertCss(css) {
  let out = ''
  for (const it of parseBlock(stripComments(css))) {
    if (it.at) {
      const inner = it.rules.map(r => (r.selector ? convertRule(r) : '')).join('')
      if (inner) out += `${it.at} {\n${inner}}\n`
    } else out += convertRule(it)
  }
  return out
}

function walk(dir, list = []) {
  for (const f of readdirSync(dir).sort()) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) walk(p, list)
    else list.push(p)
  }
  return list
}

export function buildWineComponents() {
  const files = [
    ...CSS_FILES.map(f => path.join(SRC, f)),
    ...walk(path.join(SRC, 'game')).filter(f => f.endsWith('.css')),
    ...['views', 'components', 'pages']
      .flatMap(d => walk(path.join(SRC, d)))
      .filter(f => f.endsWith('.vue') && !SKIP.some(s => path.relative(SRC, f).replaceAll('\\', '/').startsWith(s))),
  ]
  let out = `/* Винно-розовый вариант светлых стилей страниц и окон: файл собирается скриптом scripts/build-wine-components.mjs, руками не правь.
   Тонкую настройку пиши в shell-pink.css (он подключён позже). Светлая тема этим файлом не меняется. */\n`
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const blocks = f.endsWith('.css') ? [text] : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1])
    const css = blocks.map(convertCss).join('')
    if (css) out += `\n/* ${path.relative(SRC, f).replaceAll('\\', '/')} */\n${css}`
  }
  return out
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const out = buildWineComponents()
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== out) { console.error('wine-components.css отстал: запусти node scripts/build-wine-components.mjs'); process.exit(1) }
  } else writeFileSync(OUT, out)
}
