// Заливает одну манхву (результат scripts/manhwa-import.mjs) на Яндекс.Диск в «Приложения/korean/korean_manhwa/<манхва>».
// Запуск: node scripts/manhwa-upload.mjs <манхва> [папка]  (по умолчанию data/manhwa/<манхва>). Токен YADISK_TOKEN берётся из .env, наружу не печатается.
// Уже загруженные файлы того же размера пропускаются, поэтому скрипт можно запускать повторно после обрыва. Грузит по 5 файлов сразу (PARALLEL=N), помнит проверенное (--fresh: забыть), сбои Диска повторяет.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const slug = process.argv[2]
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug ?? '')) throw new Error('Первый параметр: имя папки манхвы, например love-quest')
const dir = process.argv[3] ?? join(root, 'data/manhwa', slug)
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const token = env.YADISK_TOKEN
if (!token) throw new Error('В .env нет YADISK_TOKEN')
const base = (env.YADISK_ROOT ?? '').replace(/^\/+|\/+$/g, '')
const remote = p => `app:/${[base, 'korean_manhwa', slug, p].filter(Boolean).join('/')}`
const API = 'https://cloud-api.yandex.net/v1/disk'
const H = { Authorization: `OAuth ${token}` }

async function api(method, route, params) {
  const res = await fetch(`${API}${route}?${new URLSearchParams(params)}`, { method, headers: H, signal: AbortSignal.timeout(30_000) })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
async function mkdir(p) {
  const r = await api('PUT', '/resources', { path: remote(p) })
  if (![201, 409].includes(r.status)) throw new Error(`mkdir ${p}: ${r.status}`)
}
/** Один шаг с повторами: Диск иногда отвечает 5xx или 409 (папка ещё создаётся), через секунду-другую проходит. */
async function retry(label, fn) {
  for (let k = 1; ; k++) {
    try {
      return await fn()
    } catch (e) {
      if (k >= 4) throw e
      await new Promise(r => setTimeout(r, 1500 * k))
    }
  }
}
async function upload(p, file) {
  const size = statSync(file).size
  const have = await api('GET', '/resources', { path: remote(p), fields: 'size' })
  if (have.status === 200 && have.json.size === size) return 'пропущен'
  const u = await api('GET', '/resources/upload', { path: remote(p), overwrite: 'true' })
  if (u.status !== 200) throw new Error(`upload ${p}: ${u.status}`)
  const put = await fetch(u.json.href, { method: 'PUT', body: readFileSync(file), signal: AbortSignal.timeout(300_000) })
  if (![201, 202].includes(put.status)) throw new Error(`put ${p}: ${put.status}`)
  return 'загружен'
}

{
  const r = await api('PUT', '/resources', { path: `app:/${[base, 'korean_manhwa'].filter(Boolean).join('/')}` })
  if (![201, 409].includes(r.status)) throw new Error(`mkdir korean_manhwa: ${r.status}`)
}
await mkdir('')

// Список уже проверенных файлов (путь -> размер) лежит вне папки манхвы: повторный запуск не спрашивает про них у Диска.
// Если на Диске что-то удаляли или переименовывали руками, запусти с --fresh: список будет собран заново.
const PARALLEL = Number(process.env.PARALLEL ?? 5)
const stateFile = join(homedir(), '.cache', 'korean-manhwa', `${slug}.json`)
const known = process.argv.includes('--fresh') || !existsSync(stateFile) ? {} : JSON.parse(readFileSync(stateFile, 'utf8'))
const saveState = () => {
  mkdirSync(dirname(stateFile), { recursive: true })
  writeFileSync(stateFile, JSON.stringify(known))
}

let done = 0
let skipped = 0
const chapters = readdirSync(dir).filter(d => /^\d+$/.test(d)).sort((a, b) => a - b)
for (const c of chapters) {
  await retry('mkdir', () => mkdir(c))
  const queue = readdirSync(join(dir, c)).sort()
  const started = Date.now()
  let bytes = 0
  // несколько файлов одновременно: основное время уходит на ожидание ответа Диска, а не на работу самого скрипта
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let f; (f = queue.shift()); ) {
        const file = join(dir, c, f)
        const size = statSync(file).size
        if (known[`${c}/${f}`] === size) {
          skipped++
          continue
        }
        const r = await retry(f, () => upload(`${c}/${f}`, file))
        known[`${c}/${f}`] = size
        if (r === 'пропущен') skipped++
        else {
          done++
          bytes += size
        }
      }
    }),
  )
  saveState()
  const sec = Math.max(1, (Date.now() - started) / 1000)
  console.log(`глава ${c}: готово (загружено ${done}, пропущено ${skipped})${bytes ? `, ${(bytes / 1e6).toFixed(1)} МБ, ${(bytes / 1e6 / sec).toFixed(1)} МБ/с` : ''}`)
}
// своя обложка, загруженная с сайта, записана в index.json на Диске: не теряем её при перезаливке
const local = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
try {
  const d = await api('GET', '/resources/download', { path: remote('index.json') })
  if (d.status === 200) {
    const old = await (await fetch(d.json.href, { signal: AbortSignal.timeout(30_000) })).json()
    if (old.cover && !local.cover) {
      local.cover = old.cover
      writeFileSync(join(dir, 'index.json'), JSON.stringify(local))
    }
  }
} catch {
  /* нет прежнего index.json: заливаем как есть */
}
await upload('index.json', join(dir, 'index.json'))
console.log('index.json загружен; всё на Диске в korean_manhwa/' + slug)
