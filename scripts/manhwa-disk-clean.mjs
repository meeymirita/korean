// Убирает с Яндекс.Диска файлы манхвы, которых нет в локальной папке: старые jpg и png после перевода в webp (scripts/manhwa-webp.mjs).
// Запуск: node scripts/manhwa-disk-clean.mjs <манхва> <папка-результата> [--yes]
//   без --yes только показывает, что лишнее; с --yes отправляет лишнее в корзину Диска (восстановить можно). Токен из .env, наружу не печатается.
// Папки глав и index.json не трогает, смотрит только файлы внутри глав; лишнюю папку главы (которой нет локально) тоже не удаляет, а сообщает.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const slug = process.argv[2]
const dir = process.argv[3]
const yes = process.argv.includes('--yes')
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug ?? '') || !dir) throw new Error('Запуск: node scripts/manhwa-disk-clean.mjs <манхва> <папка-результата> [--yes]')
if (!existsSync(join(dir, 'index.json'))) throw new Error(`Нет ${join(dir, 'index.json')}`)
const env = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const token = process.env.YADISK_TOKEN || env.YADISK_TOKEN
if (!token) throw new Error('Нет YADISK_TOKEN')
const base = (process.env.YADISK_ROOT ?? env.YADISK_ROOT ?? '').replace(/^\/+|\/+$/g, '')
const remote = p => `app:/${[base, 'korean_manhwa', slug, p].filter(Boolean).join('/')}`
const H = { Authorization: `OAuth ${token}` }
const API = 'https://cloud-api.yandex.net/v1/disk/resources'

async function list(p) {
  const params = new URLSearchParams({ path: remote(p), limit: '1000', fields: '_embedded.items.name,_embedded.items.type' })
  const res = await fetch(`${API}?${params}`, { headers: H, signal: AbortSignal.timeout(30_000) })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Диск ответил ${res.status} на ${p || '/'}`)
  return (await res.json())._embedded.items
}
async function trash(p) {
  const res = await fetch(`${API}?${new URLSearchParams({ path: remote(p), permanently: 'false' })}`, { method: 'DELETE', headers: H, signal: AbortSignal.timeout(30_000) })
  if (![202, 204].includes(res.status)) throw new Error(`удаление ${p}: ${res.status}`)
}

const localChapters = new Set(readdirSync(dir).filter(d => /^\d+$/.test(d)))
const extra = []
for (const item of await list('')) {
  if (item.type === 'dir' && !localChapters.has(item.name)) console.log(`на Диске есть папка ${item.name}, локально её нет: не трогаю`)
}
for (const c of [...localChapters].sort((a, b) => a - b)) {
  const have = new Set(readdirSync(join(dir, c)))
  for (const f of await list(c)) if (f.type === 'file' && !have.has(f.name)) extra.push(`${c}/${f.name}`)
}
console.log(`${slug}: лишних файлов на Диске ${extra.length}${extra.length ? ' (первые: ' + extra.slice(0, 5).join(', ') + ')' : ''}`)
if (yes) {
  let n = 0
  for (const f of extra) {
    for (let k = 1; ; k++) {
      try {
        await trash(f)
        break
      } catch (e) {
        if (k >= 4) throw e
        await new Promise(r => setTimeout(r, 1500 * k))
      }
    }
    if (++n % 100 === 0) console.log(`удалено ${n}/${extra.length}`)
  }
  console.log(`в корзину отправлено ${n}`)
} else if (extra.length) console.log('Это пробный запуск. Чтобы удалить в корзину, добавь --yes.')
