import { after, afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { fetchT, TIMEOUT, LONG_TIMEOUT } = await load('/src/lib/http.ts')
after(close)

const real = globalThis.fetch
afterEach(() => (globalThis.fetch = real))

/** Запрос, который никогда не отвечает, но честно прерывается по сигналу. */
const hang = (_url, init) =>
  new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))

describe('запросы с таймаутом', () => {
  test('таймаут по умолчанию 15 секунд, для файлов 120', () => {
    assert.equal(TIMEOUT, 15_000)
    assert.equal(LONG_TIMEOUT, 120_000)
  })

  test('зависший запрос прерывается с понятным текстом', async () => {
    globalThis.fetch = hang
    await assert.rejects(() => fetchT('/api/x', {}, 30), /сервер отвечает слишком долго/)
  })

  test('нормальный ответ возвращается как есть, параметры передаются', async () => {
    let seen
    globalThis.fetch = async (url, init) => ((seen = { url, init }), { ok: true, status: 200 })
    const res = await fetchT('/api/y', { method: 'POST', body: 'тело' })
    assert.equal(res.status, 200)
    assert.deepEqual([seen.url, seen.init.method, seen.init.body], ['/api/y', 'POST', 'тело'])
    assert.ok(seen.init.signal, 'сигнал отмены подставлен')
  })

  test('другие ошибки (нет сети) не маскируются', async () => {
    globalThis.fetch = async () => {
      throw new Error('Failed to fetch')
    }
    await assert.rejects(() => fetchT('/api/z'), /Failed to fetch/)
  })

  test('свой сигнал отмены уважается', async () => {
    globalThis.fetch = hang
    const ctl = new AbortController()
    const p = fetchT('/api/w', { signal: ctl.signal }, 5000)
    ctl.abort()
    await assert.rejects(p, /слишком долго/)
  })
})
