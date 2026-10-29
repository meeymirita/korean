/**
 * Гостевые токены: владелец создаёт их на нужное время, гость открывает сайт целиком, но сервер ничего не отдаёт ему
 * из прогресса владельца и ничего не записывает от него. Сами токены не хранятся, только хэши (sha256).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { EXPIRED_KEEP, GUESTS_FILE, MAX_GUESTS, MAX_GUEST_HOURS, TOKEN } from './config.mjs'
import { bearer, readBody, send } from './http.mjs'
import { enqueue, writeAtomic } from './storage.mjs'

const sha = text => createHash('sha256').update(text).digest()
const same = (a, b) => a.length === b.length && timingSafeEqual(a, b)

/** id → { hash (hex), label, created, expires } */
let guests = {}
try {
  guests = JSON.parse(readFileSync(GUESTS_FILE, 'utf8')) || {}
} catch {
  guests = {}
}

const save = () => enqueue(() => writeAtomic(GUESTS_FILE, JSON.stringify(guests, null, 2)))
const active = () => Object.entries(guests).filter(([, g]) => g.expires > Date.now())
const view = ([id, g]) => ({ id, label: g.label, created: g.created, expires: g.expires })

/** Кто пришёл: { role: 'owner' }, { role: 'guest', id, expires, expired } или null (токен не подошёл). */
export function whoIs(req) {
  const given = bearer(req)
  if (same(Buffer.from(given), Buffer.from(TOKEN))) return { role: 'owner' }
  if (!given) return null
  const hash = sha(given)
  for (const [id, g] of Object.entries(guests)) {
    if (same(hash, Buffer.from(g.hash, 'hex'))) return { role: 'guest', id, expires: g.expires, expired: g.expires <= Date.now() }
  }
  return null
}

/** Роль и срок гостя уходят в заголовках: клиенту нужно знать, что сохранять ничего не надо. */
export const roleHeaders = who => ({ 'X-Role': who.role, ...(who.role === 'guest' ? { 'X-Guest-Expires': String(who.expires) } : {}) })

/** Убирает записи, просроченные больше суток назад. */
function purge() {
  let changed = false
  for (const [id, g] of Object.entries(guests)) {
    if (g.expires + EXPIRED_KEEP < Date.now()) {
      delete guests[id]
      changed = true
    }
  }
  return changed ? save() : Promise.resolve()
}
setInterval(() => void purge(), 3600 * 1000).unref()

/** /api/guests (GET список, POST создать, DELETE /api/guests/:id отозвать): только для владельца. */
export async function guestsApi(req, res, url, who) {
  if (who.role !== 'owner') return send(res, 403, { error: 'forbidden' })
  const id = url.pathname.split('/')[3]

  if (!id && req.method === 'GET') return send(res, 200, active().map(view).sort((a, b) => b.created - a.created))

  if (!id && req.method === 'POST') {
    let body
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch (e) {
      return send(res, e.status || 400, { error: 'invalid json' })
    }
    const hours = Number(body.hours)
    if (!(hours >= 0.1 && hours <= MAX_GUEST_HOURS)) return send(res, 400, { error: 'invalid hours' })
    await purge()
    if (active().length >= MAX_GUESTS) return send(res, 400, { error: 'too many guests' })
    const token = randomBytes(18).toString('base64url')
    const gid = randomBytes(4).toString('hex')
    const created = Date.now()
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : ''
    guests[gid] = { hash: sha(token).toString('hex'), label, created, expires: created + Math.round(hours * 3600 * 1000) }
    await save()
    return send(res, 200, { ...view([gid, guests[gid]]), token })
  }

  if (id && req.method === 'DELETE') {
    if (!guests[id]) return send(res, 404, { error: 'not found' })
    delete guests[id]
    await save()
    return send(res, 200, { ok: true })
  }

  return send(res, 405, { error: 'method not allowed' })
}
