import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

describe('сервер: подмена картинок сайта (режим редактирования)', () => {
  let s
  before(async () => (s = await start()))
  const file = (token, key, bytes = PNG) => {
    const form = new FormData()
    form.append('file', new Blob([bytes]), 'a.png')
    return fetch(s.base + `/api/site-images/${key}/file`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
  }

  test('список открыт всем, в начале пустой', async () => {
    const r = await s.call('GET', '/api/site-images')
    assert.equal(r.status, 200)
    assert.deepEqual((await r.json()).items, {})
  })

  test('менять может только владелец: без токена и гость получают отказ', async () => {
    assert.equal((await s.call('PUT', '/api/site-images/yuna-today', null, { url: 'https://example.com/a.png' })).status, 401)
    assert.equal((await file(null, 'yuna-today')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('PUT', '/api/site-images/yuna-today', g.token, { url: 'https://example.com/a.png' })).status, 403)
    assert.equal((await s.call('DELETE', '/api/site-images/yuna-today', g.token)).status, 403)
  })

  test('ссылка: только https, положение ограничено', async () => {
    assert.equal((await s.call('PUT', '/api/site-images/yuna-today', OWNER, { url: 'http://example.com/a.png' })).status, 400)
    assert.equal((await s.call('PUT', '/api/site-images/yuna-today', OWNER, { url: 'javascript:alert(1)' })).status, 400)
    assert.equal((await s.call('PUT', '/api/site-images/..%2Fevil', OWNER, { url: 'https://example.com/a.png' })).status, 400)
    const r = await (await s.call('PUT', '/api/site-images/yuna-today', OWNER, { url: 'https://example.com/a.png', x: 500, y: -5, zoom: 9 })).json()
    assert.deepEqual([r.src, r.x, r.y, r.zoom], ['https://example.com/a.png', 100, 0, 3])
  })

  test('файл: загружается, отдаётся всем как webp, список показывает адрес', async () => {
    const up = await file(OWNER, 'shop-yuna')
    assert.equal(up.status, 201)
    const item = await up.json()
    assert.match(item.src, /^\/api\/site-images\/file\/shop-yuna\?v=1$/)
    const f = await s.call('GET', item.src)
    assert.equal(f.status, 200)
    assert.equal(f.headers.get('content-type'), 'image/webp')
    assert.equal((await file(OWNER, 'shop-yuna', Buffer.from('это не картинка'))).status, 400)
    assert.equal((await file(OWNER, 'shop-yuna')).status, 201)
    assert.match((await (await s.call('GET', '/api/site-images')).json()).items['shop-yuna'].src, /\?v=2$/)
  })

  test('положение исходной картинки сохраняется без замены файла, потом обновляется', async () => {
    const r = await (await s.call('PUT', '/api/site-images/yuna-grammar', OWNER, { x: 20, y: 70, zoom: 1.5 })).json()
    assert.deepEqual([r.src, r.x, r.y, r.zoom], ['', 20, 70, 1.5])
    const r2 = await (await s.call('PUT', '/api/site-images/yuna-grammar', OWNER, { zoom: 2 })).json()
    assert.deepEqual([r2.x, r2.y, r2.zoom], [20, 70, 2])
  })

  test('«вернуть исходную» удаляет подмену и файл', async () => {
    const src = (await (await s.call('GET', '/api/site-images')).json()).items['shop-yuna'].src
    assert.equal((await s.call('DELETE', '/api/site-images/shop-yuna', OWNER)).status, 200)
    assert.equal((await s.call('GET', src)).status, 404)
    assert.equal((await s.call('DELETE', '/api/site-images/shop-yuna', OWNER)).status, 404)
    assert.equal('shop-yuna' in (await (await s.call('GET', '/api/site-images')).json()).items, false)
  })
})
