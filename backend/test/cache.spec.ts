import { afterEach, describe, expect, it, vi } from 'vitest'
import { CacheService } from '../src/cache/cache.service'

/** Redis на памяти: только то, что вызывает CacheService. */
const fakeRedis = () => {
  const m = new Map<string, string>()
  const calls: unknown[][] = []
  return {
    status: 'ready',
    m,
    calls,
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string, ...rest: unknown[]) => void (calls.push([k, ...rest]), m.set(k, v)),
    del: async (...keys: string[]) => void keys.forEach(k => m.delete(k)),
    disconnect: () => undefined,
  }
}
const withRedis = (r: ReturnType<typeof fakeRedis>) => {
  const c = new CacheService()
  ;(c as unknown as { redis: unknown }).redis = r
  return c
}

describe('кэш данных', () => {
  afterEach(() => vi.useRealTimers())

  it('запоминает результат, а время жизни его ограничивает', async () => {
    vi.useFakeTimers()
    const c = new CacheService()
    const fn = vi.fn(async () => ({ a: 1 }))
    expect(await c.wrap('k', 10, fn)).toEqual({ a: 1 })
    expect(await c.wrap('k', 10, fn)).toEqual({ a: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(11_000)
    await c.wrap('k', 10, fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('одновременные просьбы одного ключа ждут одно вычисление', async () => {
    const c = new CacheService()
    let n = 0
    const fn = async () => {
      n++
      await new Promise(r => setTimeout(r, 5))
      return 'x'
    }
    const all = await Promise.all(Array.from({ length: 20 }, () => c.wrap('same', 60, fn)))
    expect(all.every(v => v === 'x')).toBe(true)
    expect(n).toBe(1)
  })

  it('ошибки (404 и т. п.) и «пропущенные» результаты не запоминаются', async () => {
    const c = new CacheService()
    let n = 0
    const bad = async () => {
      n++
      throw new Error('нет')
    }
    await expect(c.wrap('e', 60, bad)).rejects.toThrow()
    await expect(c.wrap('e', 60, bad)).rejects.toThrow()
    expect(n).toBe(2)
    const part = vi.fn(async () => ({ complete: false }))
    await c.wrap('p', 60, part, v => !v.complete)
    await c.wrap('p', 60, part, v => !v.complete)
    expect(part).toHaveBeenCalledTimes(2)
  })

  it('версия группы: после bump прежние ключи не находятся', async () => {
    const c = new CacheService()
    const v1 = await c.version('dict')
    await c.set(`w:${v1}:a`, 1, 60)
    await c.bump('dict')
    const v2 = await c.version('dict')
    expect(v2).toBe(v1 + 1)
    expect(await c.get(`w:${v2}:a`)).toBeUndefined()
  })

  it('с Redis: ключ с префиксом и временем жизни, чтение и удаление идут через него', async () => {
    const r = fakeRedis()
    const c = withRedis(r)
    await c.set('dict:word:1:가다', { w: 1 }, 100)
    expect(r.calls[0]).toEqual(['kc:dict:word:1:가다', 'EX', 100])
    expect(await c.get('dict:word:1:가다')).toEqual({ w: 1 })
    await c.del('dict:word:1:가다')
    expect(await c.get('dict:word:1:가다')).toBeUndefined()
  })

  it('Redis дал сбой: кэш продолжает работать в памяти', async () => {
    const r = fakeRedis()
    r.get = async () => {
      throw new Error('нет связи')
    }
    r.set = async () => {
      throw new Error('нет связи')
    }
    const c = withRedis(r)
    await c.set('k', 5, 60)
    expect(await c.get('k')).toBe(5)
  })
})
