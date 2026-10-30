/**
 * Защита сервера: заголовки безопасности, ограничение частоты запросов, блокировка подбора токена и таймауты.
 * Всё в памяти и без внешних пакетов. Лимиты можно менять переменными окружения (нужны тестам).
 */
import { Injectable } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

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

@Injectable()
export class RateLimiter {
  private readonly all = new Map<string, Bucket>()
  private readonly heavy = new Map<string, Bucket>()
  private readonly bad = new Map<string, Bad>()

  constructor() {
    // чистим старые записи, чтобы память не росла
    setInterval(() => this.sweep(), MINUTE).unref()
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
    if (b.n >= BAD_LIMIT) {
      b.until = now + LOCK_MIN * MINUTE
      return true
    }
    return false
  }

  /** Верный токен сбрасывает счётчик неверных входов этого адреса (подтверждения не трогает: они идут с уже верным токеном). */
  ok(ip: string) {
    this.bad.delete(`auth:${ip}`)
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
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
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
