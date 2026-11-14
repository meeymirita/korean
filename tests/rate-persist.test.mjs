// Блокировки подбора токена переживают перезапуск сервера: состояние хранится в Redis (здесь вместо него заглушка).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

process.env.RATE_BAD_LIMIT = '3'
process.env.RATE_LOCK_MIN = '5'
const { RateLimiter } = await import('../backend/dist/security.js')

/** Минимальный Redis: строки с временем жизни, сканирование по маске. */
function fakeRedis({ broken = false } = {}) {
  const data = new Map()
  return {
    data,
    set: async (k, v, _mode, ms) => { if (broken) throw new Error('down'); data.set(k, { v, until: Date.now() + ms }) },
    del: async k => { if (broken) throw new Error('down'); data.delete(k) },
    scan: async (_c, _m, pattern) => [ '0', [...data.keys()].filter(k => k.startsWith(pattern.replace('*', ''))) ],
    mget: async (...keys) => keys.map(k => data.get(k)?.v ?? null),
  }
}
const flush = () => new Promise(r => setTimeout(r, 5))

describe('блокировки подбора токена в Redis', () => {
  test('блокировка и счётчик после «перезапуска» (нового экземпляра) сохраняются', async () => {
    const redis = fakeRedis()
    const a = new RateLimiter()
    await a.attach(redis)
    assert.equal(a.fail('1.2.3.4'), false)
    assert.equal(a.fail('1.2.3.4'), false)
    assert.equal(a.fail('1.2.3.4'), true, 'третья неверная: блокировка')
    a.fail('5.6.7.8') // у другого адреса только одна попытка
    await flush()

    const b = new RateLimiter() // перезапуск: память пустая
    assert.equal(b.lockedFor('1.2.3.4'), 0)
    await b.attach(redis)
    assert.ok(b.lockedFor('1.2.3.4') > 0, 'блокировка поднялась из Redis')
    assert.equal(b.lockedFor('5.6.7.8'), 0)
    assert.equal(b.fail('5.6.7.8'), false)
    assert.equal(b.fail('5.6.7.8'), true, 'счётчик тоже восстановлен: 1 + 2 = 3')
  })

  test('верный токен снимает счётчик и в Redis', async () => {
    const redis = fakeRedis()
    const a = new RateLimiter()
    await a.attach(redis)
    a.fail('9.9.9.9')
    await flush()
    assert.ok(redis.data.has('rl:auth:9.9.9.9'))
    a.ok('9.9.9.9')
    await flush()
    assert.ok(!redis.data.has('rl:auth:9.9.9.9'))
  })

  test('подтверждение и вход считаются отдельно и сохраняются отдельно', async () => {
    const redis = fakeRedis()
    const a = new RateLimiter()
    await a.attach(redis)
    a.fail('1.1.1.1', 'confirm')
    a.fail('1.1.1.1')
    await flush()
    assert.deepEqual([...redis.data.keys()].sort(), ['rl:auth:1.1.1.1', 'rl:confirm:1.1.1.1'])
  })

  test('Redis недоступен: считаем в памяти и не падаем', async () => {
    const a = new RateLimiter()
    await a.attach(fakeRedis({ broken: true }))
    assert.equal(a.fail('2.2.2.2'), false)
    assert.equal(a.fail('2.2.2.2'), false)
    assert.equal(a.fail('2.2.2.2'), true)
    await flush()
    assert.ok(a.lockedFor('2.2.2.2') > 0)
  })

  test('битые и просроченные записи при подъёме пропускаются', async () => {
    const redis = fakeRedis()
    redis.data.set('rl:auth:3.3.3.3', { v: 'не json', until: Date.now() + 1000 })
    redis.data.set('rl:auth:4.4.4.4', { v: JSON.stringify({ n: 3, first: 1, until: 2 }), until: Date.now() + 1000 })
    const a = new RateLimiter()
    await a.attach(redis)
    assert.equal(a.lockedFor('3.3.3.3'), 0)
    assert.equal(a.lockedFor('4.4.4.4'), 0)
  })
})
