// IndexNow: сообщает Яндексу, Bing и другим поисковикам, какие адреса сайта новые или изменились (без Яндекс.Вебмастера).
// Ключ лежит файлом frontend/public/<ключ>.txt (публичный по замыслу IndexNow, не секрет); файл должен открываться на сайте.
//
//   node scripts/indexnow.mjs --dry                 показать, что будет отправлено, ничего не отправляя
//   node scripts/indexnow.mjs                       отправить все адреса из карты сайта (sitemap_index.xml)
//   node scripts/indexnow.mjs --limit 500           только первые 500 адресов (например, сначала пробная порция)
//   node scripts/indexnow.mjs https://korean.meeymirita.ru/dict   только перечисленные адреса
//
// BASE=https://korean.meeymirita.ru (по умолчанию). Отправка идёт порциями по 10 000 адресов на https://yandex.com/indexnow.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ENDPOINT = 'https://yandex.com/indexnow'
export const BATCH = 10_000

export const chunk = (list, n = BATCH) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n))

/** Ключ: имя единственного 32-значного .txt файла в frontend/public. */
export function findKey(dir = fileURLToPath(new URL('../frontend/public/', import.meta.url))) {
  const keys = readdirSync(dir).filter(f => /^[0-9a-f]{32}\.txt$/.test(f))
  if (keys.length !== 1) throw new Error(`в ${dir} должен быть ровно один файл-ключ IndexNow (нашёл ${keys.length})`)
  return keys[0].slice(0, 32)
}

export const buildBody = (base, key, urls) => ({ host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList: urls })

/** Адреса из sitemap_index.xml (куски) или обычного sitemap.xml. */
export async function sitemapUrls(base, get = u => fetch(u).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${u}: ${r.status}`))))) {
  const locs = xml => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
  const index = await get(`${base}/sitemap_index.xml`)
  const urls = []
  for (const part of locs(index)) urls.push(...locs(await get(new URL(part).pathname.startsWith('/') ? base + new URL(part).pathname : part)))
  return urls
}

async function main() {
  const base = (process.env.BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const li = args.indexOf('--limit')
  const limit = li >= 0 ? Number(args[li + 1]) : Infinity
  const explicit = args.filter(a => a.startsWith('http'))
  const key = findKey()
  let urls = explicit.length ? explicit : await sitemapUrls(base)
  urls = [...new Set(urls)].slice(0, limit)
  console.log(`ключ ${key}, адресов: ${urls.length}, порций: ${chunk(urls).length}${dry ? ' (пробный запуск, ничего не отправляю)' : ''}`)
  const probe = await fetch(`${base}/${key}.txt`).then(r => r.text()).catch(() => '')
  if (probe.trim() !== key) throw new Error(`файл ключа не открывается: ${base}/${key}.txt (сначала выложи сайт)`)
  if (dry) return
  for (const [i, part] of chunk(urls).entries()) {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(buildBody(base, key, part)) })
    console.log(`порция ${i + 1}: ${part.length} адресов, ответ ${res.status}`)
    if (![200, 202].includes(res.status)) { console.log((await res.text()).slice(0, 300)); process.exitCode = 1; break }
    await new Promise(r => setTimeout(r, 1500))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
