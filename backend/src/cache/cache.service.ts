import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Redis } from 'ioredis'

/**
 * Общий кэш данных. С `CACHE_REDIS_URL` лежит в отдельном Redis для кэша (без записи на диск, с пределом памяти и вытеснением давних ключей: `redis-cache` в docker-compose),
 * поэтому переживает перезапуск сервера и общий для процессов. Без адреса (тесты, локальная работа) или при сбое Redis работает кэш в памяти процесса.
 * Очередь фоновых задач и блокировки подбора токена идут в ДРУГОЙ Redis (`REDIS_URL`, `noeviction`): кэш с вытеснением туда не кладём.
 * Кладут только то, что можно вычислить заново: любой ключ с временем жизни. Личные данные владельца в общем кэше хранить можно только с ключом `owner:…` и только на стороне сервера.
 */
const PREFIX = 'kc:'
const MEM_MAX = 4000

interface Entry { v: string; until: number }

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Cache')
  private redis?: Redis
  private down = false
  private readonly mem = new Map<string, Entry>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  onModuleInit() {
    const url = process.env.CACHE_REDIS_URL
    if (!url) {
      this.log.log('CACHE_REDIS_URL не задан: кэш в памяти процесса')
      return
    }
    this.redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500, enableOfflineQueue: false, retryStrategy: n => Math.min(n * 1000, 30_000) })
    this.redis.on('error', e => {
      if (!this.down) this.log.warn(`Redis для кэша недоступен, пока кэш в памяти (${e.message})`)
      this.down = true
    })
    this.redis.on('ready', () => {
      if (this.down) this.log.log('Redis для кэша снова доступен')
      this.down = false
    })
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  private useRedis() {
    return !!this.redis && !this.down && this.redis.status === 'ready'
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.useRedis()) {
      try {
        const raw = await this.redis!.get(PREFIX + key)
        return raw === null ? undefined : (JSON.parse(raw) as T)
      } catch {
        /* Redis дал сбой: смотрим в памяти */
      }
    }
    const hit = this.mem.get(key)
    if (!hit) return undefined
    if (hit.until <= Date.now()) {
      this.mem.delete(key)
      return undefined
    }
    return JSON.parse(hit.v) as T
  }

  /** Запомнить на `ttlSec` секунд (обязательно: ключ без времени жизни не вытеснялся бы и мог забить память). */
  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (value === undefined) return
    const raw = JSON.stringify(value)
    if (this.useRedis()) {
      try {
        await this.redis!.set(PREFIX + key, raw, 'EX', Math.max(1, Math.round(ttlSec)))
        return
      } catch {
        /* Redis дал сбой: кладём в память */
      }
    }
    if (this.mem.size >= MEM_MAX) {
      const now = Date.now()
      for (const [k, e] of this.mem) if (e.until <= now) this.mem.delete(k)
      while (this.mem.size >= MEM_MAX) this.mem.delete(this.mem.keys().next().value as string)
    }
    this.mem.set(key, { v: raw, until: Date.now() + ttlSec * 1000 })
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.mem.delete(k)
    if (this.useRedis() && keys.length) await this.redis!.del(...keys.map(k => PREFIX + k)).catch(() => undefined)
  }

  /**
   * Взять из кэша или вычислить и запомнить. Одновременные просьбы одного ключа ждут одно вычисление (боты просят одну страницу десятками).
   * Ошибки (404 и т. п.) не запоминаются. `skip(value)` истинно: результат отдаём, но не запоминаем (неполные данные).
   */
  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>, skip?: (v: T) => boolean): Promise<T> {
    const hit = await this.get<T>(key)
    if (hit !== undefined) return hit
    const pending = this.inflight.get(key) as Promise<T> | undefined
    if (pending) return pending
    const job = (async () => {
      try {
        const v = await fn()
        if (!skip?.(v)) await this.set(key, v, ttlSec)
        return v
      } finally {
        this.inflight.delete(key)
      }
    })()
    this.inflight.set(key, job)
    return job
  }

  /** Номер версии группы ключей: меняется, и старые ключи группы перестают находиться (сами истекут по времени). */
  async version(ns: string): Promise<number> {
    return (await this.get<number>(`ver:${ns}`)) ?? 1
  }

  async bump(ns: string): Promise<void> {
    const next = (await this.version(ns)) + 1
    await this.set(`ver:${ns}`, next, 30 * 24 * 3600)
  }
}
