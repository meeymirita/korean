// Заливает видео на Яндекс.Диск: node scripts/upload-videos.mjs [папка] [vlog]
// Без второго слова: видеоуроки в korean_video. С «vlog»: видео влогов в korean_vlog (файлы вида SEywQdBW8W4.mp4 — номер видео на ютубе).
// Папка по умолчанию ~/Movies/Korean-videos/upload. Токен: YADISK_TOKEN в окружении или в .env проекта (YADISK_ROOT — папка внутри приложения, по умолчанию корень).
// Уже загруженные файлы того же размера пропускаются, можно прерывать и запускать снова. Нужна собранная серверная часть (npm run server:build).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(YADISK_[A-Z_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {
  /* .env нет: токен из окружения */
}
if (!process.env.YADISK_TOKEN) {
  console.error('Нет YADISK_TOKEN (в окружении или в .env)')
  process.exit(1)
}
const { YaDiskService, DISK_DIRS } = await import('../backend/dist/yadisk/yadisk.service.js')
const disk = new YaDiskService()
const vlog = process.argv[3] === 'vlog'
const target = vlog ? DISK_DIRS.vlog : DISK_DIRS.video
const dir = process.argv[2] || path.join(homedir(), 'Movies', 'Korean-videos', vlog ? 'vlog' : 'upload')
const have = new Map((await disk.list(target).catch(() => [])).map(i => [i.name, i.size]))
const files = readdirSync(dir).filter(f => /\.(mp4|webm|mov)$/i.test(f)).sort()
let done = 0
for (const f of files) {
  const file = path.join(dir, f)
  const size = statSync(file).size
  if (have.get(f) === size) {
    console.log(`= ${f} уже на Диске`)
    continue
  }
  const t = Date.now()
  await disk.upload(`${target}/${f}`, file)
  done++
  console.log(`+ ${f} ${(size / 1048576).toFixed(0)} МБ, ${Math.round((Date.now() - t) / 1000)} с`)
}
console.log(`Готово: загружено ${done}, пропущено ${files.length - done}`)
