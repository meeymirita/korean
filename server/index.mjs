/**
 * Маленький сервер для прогресса: хранит один JSON-файл и копии по дням.
 * Без зависимостей, нужен только Node. Запуск:
 *   PROGRESS_TOKEN=секрет node server/index.mjs
 * Слушает только 127.0.0.1: наружу его выставляет Caddy (reverse_proxy /api/* → порт сервера).
 */
import { timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile, copyFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 3001)
const TOKEN = process.env.PROGRESS_TOKEN || ''
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const FILE = path.join(DATA_DIR, 'progress.json')
const BACKUPS = path.join(DATA_DIR, 'backups')
const KEEP_BACKUPS = 30
const MAX_BODY = 1024 * 1024

if (!TOKEN) {
  console.error('Не задан PROGRESS_TOKEN. Пример: PROGRESS_TOKEN=секрет node server/index.mjs')
  process.exit(1)
}

const authorized = req => {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(TOKEN)
  return given.length === want.length && timingSafeEqual(given, want)
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooBig = false
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) tooBig = true // остаток читаем и выбрасываем, чтобы ответить 413
      else chunks.push(c)
    })
    req.on('end', () => (tooBig ? reject(Object.assign(new Error('too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8'))))
    req.on('error', reject)
  })
}

/** Один раз в день кладём копию текущего файла и храним последние KEEP_BACKUPS штук. */
async function backup() {
  const day = new Date().toISOString().slice(0, 10)
  const target = path.join(BACKUPS, `progress-${day}.json`)
  try {
    await mkdir(BACKUPS, { recursive: true })
    try {
      await readFile(target)
    } catch {
      await copyFile(FILE, target)
    }
    const files = (await readdir(BACKUPS)).filter(f => f.startsWith('progress-')).sort()
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) await unlink(path.join(BACKUPS, old))
  } catch {
    /* копии — дополнительная страховка, их отсутствие не должно ломать сохранение */
  }
}

/** Записи идут строго по очереди: два запроса не могут одновременно писать во временный файл. */
let queue = Promise.resolve()
const enqueue = task => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

/** Запись через временный файл: файл прогресса не может остаться наполовину записанным. */
async function writeAtomic(text) {
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = FILE + '.tmp'
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, FILE)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/api/health') return send(res, 200, { ok: true })
    if (url.pathname !== '/api/progress') return send(res, 404, { error: 'not found' })
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' })

    if (req.method === 'GET') {
      try {
        return send(res, 200, JSON.parse(await readFile(FILE, 'utf8')))
      } catch {
        return send(res, 200, {})
      }
    }

    if (req.method === 'PUT') {
      let data
      try {
        data = JSON.parse(await readBody(req))
      } catch (e) {
        return send(res, e.status || 400, { error: e.status === 413 ? 'too large' : 'invalid json' })
      }
      if (!data || typeof data !== 'object' || data.v !== 1) return send(res, 400, { error: 'invalid progress' })
      await enqueue(async () => {
        await backup()
        await writeAtomic(JSON.stringify(data, null, 2))
      })
      return send(res, 200, { ok: true, updated: data.updated ?? null })
    }

    return send(res, 405, { error: 'method not allowed' })
  } catch (e) {
    console.error(e)
    return send(res, 500, { error: 'server error' })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`Прогресс: http://127.0.0.1:${PORT}/api/progress, данные в ${DATA_DIR}`))
