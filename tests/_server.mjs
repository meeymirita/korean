// Запуск настоящего сервера (backend/dist/main.js) на свободном порту с временной папкой данных для тестов.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPrismaClient } from './_db.mjs'

const SERVER = fileURLToPath(new URL('../backend/dist/main.js', import.meta.url))
export const OWNER = 'owner-secret-for-tests'
const children = []
const dirs = []
const schemas = new Map()
let adminPrisma

const prisma = async () => {
  if (!adminPrisma) {
    if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) throw new Error('Для серверных тестов нужен TEST_DATABASE_URL или DATABASE_URL')
    const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    adminPrisma = createPrismaClient({ datasources: { db: { url } } })
    await adminPrisma.$connect()
  }
  return adminPrisma
}

const migrate = (url) => new Promise((resolve, reject) => {
  const cli = fileURLToPath(new URL('../backend/node_modules/prisma/build/index.js', import.meta.url))
  const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', d => { output += d })
  child.stderr.on('data', d => { output += d })
  child.once('error', reject)
  child.once('close', code => code === 0 ? resolve() : reject(new Error(`Prisma migrate deploy завершился с кодом ${code}: ${output.slice(-2000)}`)))
})

const freePort = () =>
  new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

/** Поднимает сервер. dir — папка данных (по умолчанию новая временная), чтобы проверять перезапуск на тех же данных. */
export async function start({ dir, env = {} } = {}) {
  if (!dir) {
    dir = await mkdtemp(path.join(tmpdir(), 'server-test-'))
    dirs.push(dir)
  }
  let schema = schemas.get(dir)
  if (!schema) {
    schema = `test_${process.pid}_${Math.random().toString(36).slice(2, 10)}`
    const client = await prisma()
    await client.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    const databaseUrl = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
    databaseUrl.searchParams.set('schema', schema)
    await migrate(databaseUrl.toString())
    schemas.set(dir, schema)
  }
  const port = await freePort()
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
  databaseUrl.searchParams.set('schema', schema)
  const dumpUrl = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
  dumpUrl.searchParams.delete('schema')
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      PROGRESS_TOKEN: OWNER,
      DATABASE_URL: databaseUrl.toString(),
      PG_DUMP_DATABASE_URL: dumpUrl.toString(),
      PG_DUMP_SCHEMA: schema,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  children.push(child)
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve)
    child.once('exit', code => reject(new Error('сервер не запустился, код ' + code)))
  })
  const base = `http://127.0.0.1:${port}`
  /** Загрузка файла: multipart, поле file (и необязательное caption). */
  const upload = (token, bytes, name = 'photo.png', caption, extra = {}) => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    if (caption !== undefined) form.append('caption', caption)
    for (const [k, v] of Object.entries(extra)) form.append(k, v)
    return fetch(base + '/api/images', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  }
  /** Опасные запросы владельца (создание гостя, сброс и загрузка копии) сайт шлёт с повторным токеном: хелпер делает так же, если не задан свой заголовок. */
  const dangerous = (method, url, body) =>
    method === 'POST' && (url === '/api/guests' || (url === '/api/ops' && Array.isArray(body?.ops) && body.ops.some(o => o?.type === 'reset' || o?.type === 'import')))
  /** call('GET', '/api/notes', токен, тело, свои заголовки) */
  const call = (method, url, token, body, extra = {}) =>
    fetch(base + url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token === OWNER && dangerous(method, url, body) && !Object.keys(extra).some(k => k.toLowerCase() === 'x-confirm-token') ? { 'X-Confirm-Token': OWNER } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const stop = () =>
    new Promise(resolve => {
      child.once('exit', resolve)
      child.kill()
    })
  return { dir, schema, base, call, upload, stop }
}

/** Вызывать в after(): гасит серверы и удаляет временные папки. */
export async function cleanup() {
  await Promise.all(children.map(child => new Promise(resolve => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', resolve)
    child.kill()
  })))
  if (adminPrisma) {
    for (const schema of new Set(schemas.values())) await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await adminPrisma.$disconnect()
    adminPrisma = undefined
  }
  schemas.clear()
  await Promise.all(dirs.map(d => rm(d, { recursive: true, force: true })))
}
