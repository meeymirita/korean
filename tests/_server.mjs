// Запуск настоящего сервера (server/dist/main.js) на свободном порту с временной папкой данных для тестов.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('../server/dist/main.js', import.meta.url))
export const OWNER = 'owner-secret-for-tests'
const children = []
const dirs = []

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
  const port = await freePort()
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, PROGRESS_TOKEN: OWNER, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  children.push(child)
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve)
    child.once('exit', code => reject(new Error('сервер не запустился, код ' + code)))
  })
  const base = `http://127.0.0.1:${port}`
  /** Загрузка файла: multipart, поле file (и необязательное caption). */
  const upload = (token, bytes, name = 'photo.png', caption) => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    if (caption !== undefined) form.append('caption', caption)
    return fetch(base + '/api/images', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  }
  /** call('GET', '/api/notes', токен, тело) */
  const call = (method, url, token, body) =>
    fetch(base + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const stop = () =>
    new Promise(resolve => {
      child.once('exit', resolve)
      child.kill()
    })
  return { dir, base, call, upload, stop }
}

/** Вызывать в after(): гасит серверы и удаляет временные папки. */
export async function cleanup() {
  children.forEach(c => c.kill())
  await Promise.all(dirs.map(d => rm(d, { recursive: true, force: true })))
}
