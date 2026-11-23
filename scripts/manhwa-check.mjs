// Сверяет папку манхвы на Яндекс.Диске с локальной (результат manhwa-import.mjs): чего нет и что другого размера.
// Запуск: node scripts/manhwa-check.mjs <манхва> [папка]. Токен: YADISK_TOKEN из окружения или из .env, наружу не печатается.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const slug = process.argv[2]
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug ?? '')) throw new Error('Первый параметр: имя папки манхвы, например love-quest')
const dir = process.argv[3] ?? join(root, 'data/manhwa', slug)
const envFile = existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : ''
const env = Object.fromEntries(envFile.split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const token = process.env.YADISK_TOKEN || env.YADISK_TOKEN
if (!token) throw new Error('Нет YADISK_TOKEN (ни в окружении, ни в .env)')
const base = (process.env.YADISK_ROOT ?? env.YADISK_ROOT ?? '').replace(/^\/+|\/+$/g, '')
const remote = p => `app:/${[base, 'korean_manhwa', slug, p].filter(Boolean).join('/')}`

async function list(p) {
  const params = new URLSearchParams({ path: remote(p), limit: '1000', fields: '_embedded.items.name,_embedded.items.size,_embedded.items.type' })
  const res = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?${params}`, { headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(30_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Диск ответил ${res.status} на ${p || '/'}`)
  return (await res.json())._embedded.items
}

const top = await list('')
if (!top) throw new Error(`На Диске нет папки korean_manhwa/${slug}`)
let files = 0
const bad = []
if (!top.some(i => i.name === 'index.json')) bad.push('нет index.json')
const [lo, hi] = (process.env.CHAPTERS ?? '0-999').split('-').map(Number) // CHAPTERS=50-61: проверить только эти главы
for (const c of readdirSync(dir).filter(d => /^\d+$/.test(d) && +d >= lo && +d <= (hi ?? lo)).sort((a, b) => a - b)) {
  const have = new Map(((await list(c)) ?? []).map(i => [i.name, i.size]))
  for (const f of readdirSync(join(dir, c))) {
    files++
    if (!have.has(f)) bad.push(`нет ${c}/${f}`)
    else if (have.get(f) !== statSync(join(dir, c, f)).size) bad.push(`другой размер ${c}/${f}`)
  }
}
console.log(`${slug}: локально файлов ${files}, проблем ${bad.length}`)
for (const b of bad.slice(0, +(process.env.SHOW ?? 40))) console.log(' ', b)
if (bad.length > 40) console.log(`  … и ещё ${bad.length - 40}`)
