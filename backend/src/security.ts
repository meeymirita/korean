/**
 * Защита сервера: заголовки безопасности, ограничение частоты запросов, блокировка подбора токена и таймауты.
 * Всё в памяти и без внешних пакетов. Лимиты можно менять переменными окружения (нужны тестам).
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Redis } from 'ioredis'
import type { NextFunction, Request, Response } from 'express'
import { SWAGGER } from './config.js'
import { logWarn } from './log.js'

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/** Запросов в минуту с одного адреса вообще. */
export const LIMIT_PER_MIN = num('RATE_LIMIT_PER_MIN', 600)
/** Тяжёлые маршруты (загрузка картинок, создание гостевых токенов) в минуту. */
export const HEAVY_PER_MIN = num('RATE_HEAVY_PER_MIN', 40)
/** Неверных токенов подряд, после которых адрес блокируется. */
export const BAD_LIMIT = num('RATE_BAD_LIMIT', 10)
/** Сколько минут держится блокировка. */
export const LOCK_MIN = num('RATE_LOCK_MIN', 15)
/** Таймаут ответа обычного запроса и запроса с загрузкой файла, мс. */
export const RESPONSE_TIMEOUT = 30_000
export const UPLOAD_TIMEOUT = 180_000

const MINUTE = 60_000
const MAX_TRACKED = 20_000

interface Bucket {
  start: number
  n: number
}
interface Bad {
  n: number
  first: number
  until: number
}

/** IP клиента: за Caddy (loopback) берётся из X-Forwarded-For, напрямую — адрес соединения. Задано через `trust proxy` в main.ts. */
export const clientIp = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown'

/** Частный или локальный адрес: сама машина, сеть Docker, домашняя сеть. */
export const isPrivateAddress = (address: string) => {
  const a = address.replace(/^::ffff:/, '').toLowerCase()
  if (a === '::1' || a.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(a)) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a)
  if (!m) return false
  const [x, y] = [Number(m[1]), Number(m[2])]
  return x === 127 || x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254)
}

/**
 * Запрос пришёл изнутри (серверная часть сайта, Prometheus), а не от посетителя: соединение с частного адреса и без заголовков прокси.
 * Всё, что приходит снаружи, идёт через Caddy, а он всегда дописывает X-Forwarded-For; посетитель убрать его не может.
 */
export const isInternal = (req: Request) =>
  !req.headers['x-forwarded-for'] && !req.headers['forwarded'] && !req.headers['x-real-ip'] && isPrivateAddress(req.socket?.remoteAddress || '')

/** Что нужно от Redis для хранения блокировок (тесты подставляют свою заглушку). */
export interface BadStore {
  set(key: string, value: string, mode: 'PX', ms: number): Promise<unknown>
  del(key: string): Promise<unknown>
  scan(cursor: string, match: 'MATCH', pattern: string, count: 'COUNT', n: number): Promise<[string, string[]]>
  mget(...keys: string[]): Promise<(string | null)[]>
}
const PREFIX = 'rl:'

@Injectable()
export class RateLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly all = new Map<string, Bucket>()
  private readonly heavy = new Map<string, Bucket>()
  private readonly bad = new Map<string, Bad>()
  /** Redis: счётчики неверных токенов и блокировки переживают перезапуск сервера. Без него всё только в памяти. */
  private store?: BadStore
  private redis?: Redis
  private storeFailed = false

  constructor() {
    // чистим старые записи, чтобы память не росла
    setInterval(() => this.sweep(), MINUTE).unref()
  }

  async onModuleInit() {
    const url = process.env.REDIS_URL
    if (!url || process.env.NODE_ENV === 'test') return
    try {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500, enableOfflineQueue: false, retryStrategy: n => Math.min(n * 1000, 30_000) })
      this.redis.on('error', () => this.storeError())
      await Promise.race([
        new Promise<void>(resolve => this.redis!.once('ready', () => resolve())),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Redis не ответил за 3 с')), 3000).unref()),
      ])
      await this.attach(this.redis as unknown as BadStore)
    } catch (e) {
      this.storeError(e as Error)
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  /** Подключает хранилище и поднимает из него прежние счётчики (после перезапуска блокировка не сбрасывается). */
  async attach(store: BadStore) {
    this.store = store
    const now = Date.now()
    let cursor = '0'
    do {
      const [next, keys] = await store.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 200)
      cursor = next
      if (!keys.length) continue
      const values = await store.mget(...keys)
      keys.forEach((k, i) => {
        try {
          const b = JSON.parse(values[i] ?? '') as Bad
          const key = k.slice(PREFIX.length)
          const live = b.until > now || now - b.first <= LOCK_MIN * MINUTE
          if (live && Number.isFinite(b.n) && !this.bad.has(key)) this.bad.set(key, b)
        } catch {
          /* битая или чужая запись */
        }
      })
    } while (cursor !== '0')
  }

  private storeError(e?: Error) {
    if (this.storeFailed) return
    this.storeFailed = true
    logWarn('Блокировки подбора токена: Redis недоступен, считаются только в памяти' + (e ? ` (${e.message})` : ''))
    setTimeout(() => (this.storeFailed = false), 10 * MINUTE).unref()
  }

  /** Записывает состояние в Redis (без ожидания: запрос не должен ждать), `null` удаляет. */
  private persist(key: string, b: Bad | null) {
    if (!this.store) return
    const ttl = b ? Math.max(1000, Math.max(b.until, b.first + LOCK_MIN * MINUTE) - Date.now()) : 0
    const op = b ? this.store.set(PREFIX + key, JSON.stringify(b), 'PX', ttl) : this.store.del(PREFIX + key)
    op.catch(() => this.storeError())
  }

  private sweep() {
    const now = Date.now()
    for (const m of [this.all, this.heavy]) for (const [k, b] of m) if (now - b.start > MINUTE) m.delete(k)
    for (const [k, b] of this.bad) if (b.until < now && now - b.first > LOCK_MIN * MINUTE) this.bad.delete(k)
  }

  private hit(map: Map<string, Bucket>, ip: string, limit: number): boolean {
    const now = Date.now()
    let b = map.get(ip)
    if (!b || now - b.start >= MINUTE) {
      if (map.size >= MAX_TRACKED) map.clear() // защита самой памяти: при потопе адресов начинаем заново
      b = { start: now, n: 0 }
      map.set(ip, b)
    }
    return ++b.n <= limit
  }

  /** Осталось секунд блокировки адреса (0 — не заблокирован); неверный вход и неверное подтверждение считаются отдельно, блокирует любое. */
  lockedFor(ip: string): number {
    const now = Date.now()
    return Math.max(0, ...(['auth', 'confirm'] as const).map(k => {
      const b = this.bad.get(`${k}:${ip}`)
      return b && b.until > now ? Math.ceil((b.until - now) / 1000) : 0
    }))
  }

  /** Неверный токен (kind 'auth') или неверное подтверждение опасного действия ('confirm'): после BAD_LIMIT попыток подряд адрес блокируется на LOCK_MIN минут. */
  fail(ip: string, kind: 'auth' | 'confirm' = 'auth'): boolean {
    const now = Date.now()
    const key = `${kind}:${ip}`
    let b = this.bad.get(key)
    if (!b || now - b.first > LOCK_MIN * MINUTE) {
      if (this.bad.size >= MAX_TRACKED) this.bad.clear()
      b = { n: 0, first: now, until: 0 }
      this.bad.set(key, b)
    }
    b.n++
    const locked = b.n >= BAD_LIMIT
    if (locked) b.until = now + LOCK_MIN * MINUTE
    this.persist(key, b)
    return locked
  }

  /** Верный токен сбрасывает счётчик неверных входов этого адреса (подтверждения не трогает: они идут с уже верным токеном). */
  ok(ip: string) {
    if (this.bad.delete(`auth:${ip}`)) this.persist(`auth:${ip}`, null)
  }

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const ip = clientIp(req)
    const wait = this.lockedFor(ip)
    if (wait) {
      res.setHeader('Retry-After', String(wait))
      return void res.status(429).json({ error: 'locked' })
    }
    const heavy = req.method === 'POST' && /^\/api\/(images|guests)/.test(req.path)
    if (!this.hit(this.all, ip, LIMIT_PER_MIN) || (heavy && !this.hit(this.heavy, ip, HEAVY_PER_MIN))) {
      res.setHeader('Retry-After', '60')
      return void res.status(429).json({ error: 'too many requests' })
    }
    next()
  }
}

/** Заголовки безопасности для каждого ответа API. */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  // страница Swagger (только при SWAGGER=1) грузит свои скрипты, стили и картинки
  const docs = SWAGGER && req.path.startsWith('/api/docs')
  res.setHeader('Content-Security-Policy', docs
    ? "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store')
  next()
}

/** Таймаут на запрос: зависшее соединение закрывается. Для загрузки картинок время больше. */
export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  const ms = req.method === 'POST' && req.path.startsWith('/api/images') ? UPLOAD_TIMEOUT : RESPONSE_TIMEOUT
  req.setTimeout(ms)
  res.setTimeout(ms, () => {
    if (!res.headersSent) res.status(503).json({ error: 'timeout' })
    res.end()
  })
  next()
}
