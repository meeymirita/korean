import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reply, offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
let store
beforeEach(() => {
  ls.clear()
  globalThis.fetch = offline
  setActivePinia(createPinia())
  store = useProgressStore()
})
afterEach(() => {
  store.disconnect()
  globalThis.fetch = realFetch
})

describe('вход с кодом из письма (магазин)', () => {
  test('сервер просит код: токен остаётся, доступ закрыт, нужен второй шаг', async () => {
    globalThis.fetch = reply(401, { error: '2fa' })
    assert.equal(await store.connect('secret'), false)
    assert.equal(store.needs2fa, true)
    assert.equal(store.token, 'secret')
    assert.equal(store.unlocked, false)
    assert.equal(ls.get('progress_token'), 'secret')
  })

  test('неверный токен по-прежнему закрывает всё и стирает токен', async () => {
    globalThis.fetch = reply(401, { error: 'unauthorized' })
    assert.equal(await store.connect('чужой'), false)
    assert.equal(store.needs2fa, false)
    assert.equal(store.token, '')
  })

  test('сеанс: идёт в заголовке вместе с токеном через пробел, запоминается и стирается при выходе', () => {
    store.token = 'secret'
    assert.equal(store.bearer, 'secret')
    store.setSession('a'.repeat(32))
    assert.equal(store.bearer, 'secret ' + 'a'.repeat(32))
    assert.equal(ls.get('progress_session'), 'a'.repeat(32))
    store.disconnect()
    assert.equal(store.bearer, '')
    assert.equal(ls.get('progress_session'), undefined)
  })

  test('запросы уходят с токеном и сеансом', async () => {
    let seen = ''
    globalThis.fetch = async (url, init) => ((seen = init.headers.Authorization), reply(200, { v: 1, updated: 0 })())
    store.token = 'secret'
    store.setSession('b'.repeat(32))
    await store.init()
    assert.equal(seen, 'Bearer secret ' + 'b'.repeat(32))
    assert.equal(store.unlocked, true)
  })

  test('другой токен (например, гостевой) начинает без чужого сеанса', async () => {
    store.token = 'owner-secret'
    store.setSession('c'.repeat(32))
    let seen = ''
    globalThis.fetch = async (url, init) => ((seen = init.headers.Authorization), reply(200, { v: 1, updated: 0 })())
    await store.connect('guest-token')
    assert.equal(seen, 'Bearer guest-token')
  })
})
