// Переводит страницы манхвы в webp: меньше места на Диске и быстрее чтение (png до 10 раз меньше, jpeg примерно вдвое).
// Запуск: node scripts/manhwa-webp.mjs <манхва> [папка-с-главами] [папка-результата]
//   по умолчанию берёт data/manhwa/<манхва> (или MANHWA_OUT) и пишет рядом в <папка>-webp; исходные файлы не меняются.
// Переменные: QUALITY (82), CONCURRENCY (2: ноутбук слабый), MAX_SIDE (16383, предел webp: если сторона больше, страница остаётся как есть).
// Результат: те же папки глав, страницы 001.webp…, cover.jpg глав как был, index.json с новыми именами и размерами. Дальше его загружают на Диск
// (scripts/manhwa-upload.mjs <манхва> <папка-результата>), а старые файлы на Диске заменяют (scripts/manhwa-disk-clean.mjs).
// Нужен sharp из backend/node_modules.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../backend/package.json', import.meta.url))
const sharp = require('sharp')
const slug = process.argv[2]
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug ?? '')) throw new Error('Первый параметр: имя папки манхвы, например dnevnik-plohih-myslei')
const root = process.env.MANHWA_OUT ?? fileURLToPath(new URL('../data/manhwa/', import.meta.url))
const src = process.argv[3] ?? join(root, slug)
const out = process.argv[4] ?? `${src.replace(/\/+$/, '')}-webp`
if (!existsSync(join(src, 'index.json'))) throw new Error(`Нет ${join(src, 'index.json')}: сначала manhwa-import.mjs`)
const QUALITY = Number(process.env.QUALITY ?? 82)
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 2))
const MAX_SIDE = Number(process.env.MAX_SIDE ?? 16383)
sharp.concurrency(1)

const index = JSON.parse(readFileSync(join(src, 'index.json'), 'utf8'))
rmSync(out, { recursive: true, force: true })
let before = 0
let after = 0
let kept = 0
const tasks = []
for (const c of index.chapters) {
  mkdirSync(join(out, String(c.n)), { recursive: true })
  if (c.cv) copyFileSync(join(src, String(c.n), c.cv), join(out, String(c.n), c.cv))
  for (const p of c.pages) tasks.push({ c, p })
}

async function convert({ c, p }) {
  const from = join(src, String(c.n), p.f)
  const size = statSync(from).size
  before += size
  const name = basename(p.f, extname(p.f)) + '.webp'
  const to = join(out, String(c.n), name)
  let ok = false
  if (p.f.endsWith('.webp')) {
    // уже webp: перекодировать смысла нет
  } else if (p.w <= MAX_SIDE && p.h <= MAX_SIDE) {
    try {
      const info = await sharp(from).webp({ quality: QUALITY, effort: 4 }).toFile(to)
      if (info.size < size) {
        after += info.size
        p.f = name
        p.w = info.width
        p.h = info.height
        ok = true
      } else rmSync(to, { force: true }) // webp вышел не меньше: оставляем исходник
    } catch (e) {
      console.log(`  ${c.n}/${p.f}: не переведён (${e instanceof Error ? e.message : e}), остаётся как есть`)
    }
  }
  if (!ok) {
    copyFileSync(from, join(out, String(c.n), p.f))
    after += size
    kept++
  }
}

let done = 0
const total = tasks.length
const started = Date.now()
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let t; (t = tasks.shift()); ) {
      await convert(t)
      if (++done % 100 === 0 || done === total) {
        const sec = (Date.now() - started) / 1000
        console.log(`${done}/${total} страниц, ${(before / 1e6).toFixed(0)} МБ -> ${(after / 1e6).toFixed(0)} МБ, ${(done / sec).toFixed(1)} стр/с`)
      }
    }
  }),
)
writeFileSync(join(out, 'index.json'), JSON.stringify(index))
console.log(`готово: ${out}\nбыло ${(before / 1e6).toFixed(0)} МБ, стало ${(after / 1e6).toFixed(0)} МБ (${Math.round((after / before) * 100)}%); оставлены как были: ${kept}`)
