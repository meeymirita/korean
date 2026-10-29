import { after, afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { reply } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
const { useImagesStore, formatSize, ALLOWED } = await load('/src/stores/images.ts')
const { useProgressStore } = await load('/src/stores/progress.ts')
after(close)

const realFetch = globalThis.fetch
const realUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
let store
beforeEach(() => {
  ls.clear()
  ls.set('progress_token', 'токен') // кириллица в заголовок не попадёт: fetch подменён
  setActivePinia(createPinia())
  store = useImagesStore()
  let n = 0
  URL.createObjectURL = () => `blob:test/${++n}`
  URL.revokeObjectURL = () => undefined
})
afterEach(() => {
  useProgressStore().disconnect()
  globalThis.fetch = realFetch
  URL.createObjectURL = realUrl.create
  URL.revokeObjectURL = realUrl.revoke
})

const item = (id, o = {}) => ({ id, name: id + '.png', caption: '', mime: 'image/png', size: 1000, width: 10, height: 10, created: 1, ...o })
const MB = 1024 * 1024

describe('formatSize', () => {
  test('килобайты и мегабайты', () => {
    assert.equal(formatSize(300), '1 КБ')
    assert.equal(formatSize(2048), '2 КБ')
    assert.equal(formatSize(1.5 * MB), '1.5 МБ')
    assert.equal(formatSize(50 * MB), '50 МБ')
  })
})

describe('проверка файла до отправки', () => {
  test('разрешены только JPEG, PNG, GIF и WebP', () => {
    for (const type of ALLOWED) assert.equal(store.check({ type, size: 10, name: 'a' }), null, type)
    for (const type of ['image/svg+xml', 'text/html', 'application/pdf', '']) assert.match(store.check({ type, size: 10, name: 'a' }), /нужны JPEG/, type)
  })

  test('больше 50 МБ и сверх свободного места не проходит', () => {
    assert.match(store.check({ type: 'image/png', size: 51 * MB, name: 'big.png' }), /больше 50 МБ/)
    store.used = 480 * MB
    assert.match(store.check({ type: 'image/png', size: 30 * MB, name: 'x.png' }), /не хватает места/)
    assert.equal(store.check({ type: 'image/png', size: 10 * MB, name: 'ok.png' }), null)
  })
})

describe('список, загрузка, подпись, удаление', () => {
  test('список с сервера: картинки, занятое место и лимиты', async () => {
    globalThis.fetch = reply(200, { items: [item('a'), item('b')], used: 2000, limit: 100 * MB, maxFile: 5 * MB })
    await store.load()
    assert.deepEqual([store.items.length, store.used, store.limit, store.maxFile, store.loaded], [2, 2000, 100 * MB, 5 * MB, true])
  })

  test('загрузка: новая картинка сверху, место растёт, запрос multipart с токеном', async () => {
    let sent
    globalThis.fetch = async (url, opt) => ((sent = { url, opt }), reply(201, item('new', { size: 500 }))())
    await store.upload(new File([new Uint8Array(500)], 'new.png', { type: 'image/png' }))
    assert.equal(sent.url, '/api/images')
    assert.equal(sent.opt.method, 'POST')
    assert.ok(sent.opt.body instanceof FormData)
    assert.equal(sent.opt.headers.Authorization, 'Bearer токен')
    assert.deepEqual([store.items[0].id, store.used], ['new', 500])
  })

  test('ошибки загрузки объясняются по-человечески', async () => {
    const f = new File([new Uint8Array(5)], 'a.png', { type: 'image/png' })
    const cases = [[413, /слишком большой или закончилось место/], [400, /не получилось прочитать/], [403, /только владельцу/], [401, /войти по токену/], [500, /ошибка сервера 500/]]
    for (const [status, re] of cases) {
      globalThis.fetch = reply(status)
      await assert.rejects(() => store.upload(f), re, String(status))
    }
    globalThis.fetch = async () => {
      throw new Error('Failed to fetch')
    }
    await assert.rejects(() => store.upload(f), /сервер недоступен/)
    assert.equal(store.items.length, 0, 'ничего лишнего в списке')
  })

  test('подпись меняется в списке', async () => {
    globalThis.fetch = reply(200, { items: [item('a')], used: 1000, limit: MB, maxFile: MB })
    await store.load()
    globalThis.fetch = reply(200, { ok: true })
    await store.setCaption('a', '  Мой кот ')
    assert.equal(store.items[0].caption, 'Мой кот')
  })

  test('удаление: картинка пропадает, место освобождается, повторное удаление не ошибка', async () => {
    globalThis.fetch = reply(200, { items: [item('a', { size: 700 }), item('b')], used: 1700, limit: MB, maxFile: MB })
    await store.load()
    globalThis.fetch = reply(200, { ok: true })
    await store.remove('a')
    assert.deepEqual([store.items.map(i => i.id), store.used], [['b'], 1000])
    globalThis.fetch = reply(404)
    await store.remove('b')
    assert.equal(store.items.length, 0)
    globalThis.fetch = reply(500)
    await assert.rejects(() => store.remove('x'), /ошибка сервера 500/)
  })

  test('файл запрашивается с токеном один раз, повторно берётся из памяти', async () => {
    let calls = 0
    globalThis.fetch = async (url, opt) => (calls++, assert.equal(opt.headers.Authorization, 'Bearer токен'), { ok: true, status: 200, blob: async () => new Blob(['x']) })
    const [a, b] = [await store.blobUrl('a', 'thumb'), await store.blobUrl('a', 'thumb')]
    assert.equal(a, b)
    assert.equal(calls, 1)
    await store.blobUrl('a', 'file')
    assert.equal(calls, 2, 'оригинал и миниатюра — разные файлы')
  })

  test('неудачная загрузка файла не запоминается: следующая попытка пробует снова', async () => {
    globalThis.fetch = reply(500)
    await assert.rejects(() => store.blobUrl('z', 'thumb'))
    globalThis.fetch = async () => ({ ok: true, status: 200, blob: async () => new Blob(['x']) })
    assert.match(await store.blobUrl('z', 'thumb'), /^blob:/)
  })
})
