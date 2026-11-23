// Импорт манхвы: раскладывает главы по порядку и пишет index.json (картинки в git не идут).
// Запуск: node scripts/manhwa-import.mjs <папка с chapter-NN> <папка-манхвы-латиницей> ["Название"]
// Пример: node scripts/manhwa-import.mjs ~/Downloads/love-quest-download love-quest "Love Quest"
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = process.argv[2]
const slug = process.argv[3]
const title = process.argv[4] ?? slug
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug ?? '')) throw new Error('Второй параметр: имя папки манхвы латиницей, например love-quest')
if (!src || !existsSync(src)) throw new Error('Укажи папку с главами: node scripts/manhwa-import.mjs <папка>')
// куда складывать: по умолчанию data/manhwa (её читает локальный сервер без Диска); на Диск она уезжает целиком в korean_manhwa (scripts/manhwa-upload.mjs)
const out = join(process.env.MANHWA_OUT ?? fileURLToPath(new URL('../data/manhwa/', import.meta.url)), slug) + '/'

/** размеры картинки по заголовку (webp и jpeg), без библиотек */
function size(file) {
  const b = readFileSync(file)
  if (b.toString('ascii', 0, 4) === 'RIFF') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
    if (kind === 'VP8L') {
      const v = b.readUInt32LE(21)
      return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]
    }
  }
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m === 0xc0 || m === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
    i += 2 + b.readUInt16BE(i + 2)
  }
  throw new Error('неизвестный формат ' + file)
}

rmSync(out, { recursive: true, force: true })
const chapters = []
for (const dir of readdirSync(src).filter(d => /^chapter-\d+$/i.test(d)).sort()) {
  const n = Number(dir.slice(8))
  const files = readdirSync(join(src, dir))
    .filter(f => /\.(webp|jpe?g|png)$/i.test(f))
    .map(f => {
      const ch = f.match(/^ch(\d+)_/)
      const idx = f.match(/\.0-(\d+)/) ?? f.match(/^(\d+)[_.]/)
      const tile = f.match(/_tile(\d+)/)
      return { f, ch: ch ? Number(ch[1]) : n, idx: idx ? Number(idx[1]) : NaN, tile: tile ? Number(tile[1]) : 0 }
    })
    .filter(x => x.ch === n) // в папке лежит чужая первая страница следующей главы
    .sort((a, b) => a.idx - b.idx || a.tile - b.tile)
  const pages = []
  mkdirSync(join(out, String(n)), { recursive: true })
  files.forEach((x, k) => {
    const name = `${String(k + 1).padStart(3, '0')}${extname(x.f).toLowerCase()}`
    copyFileSync(join(src, dir, x.f), join(out, String(n), name))
    const [w, h] = size(join(src, dir, x.f))
    pages.push({ f: name, w, h })
  })
  const idxs = [...new Set(files.map(x => x.idx))]
  const gaps = idxs.filter((v, i) => i && v !== idxs[i - 1] + 1)
  // маленькая обложка: страницы-ленты бывают в 10 000 пикселей высотой, и список глав на них тормозит
  let cv = false
  const first = pages[1] ?? pages[0]
  if (first) {
    try {
      const s = join(out, String(n), first.f)
      const d = join(out, String(n), 'cover.jpg')
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '--resampleWidth', '300', s, '--out', d], { stdio: 'ignore' })
      execFileSync('sips', ['--cropToHeightWidth', '400', '300', '--cropOffset', '0', '0', d], { stdio: 'ignore' })
      cv = true
    } catch {
      /* без sips (не macOS): остаётся полная страница */
    }
  }
  chapters.push({ n, pages, ...(cv ? { cv: 'cover.jpg' } : {}) })
  console.log(`глава ${n}: ${pages.length} стр.${gaps.length ? ' (пропуски в нумерации!)' : ''}`)
}
writeFileSync(join(out, 'index.json'), JSON.stringify({ title, chapters }))
console.log(`готово: ${chapters.length} глав`)
