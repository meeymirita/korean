import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)
const sharp = createRequire(import.meta.url)('../server/node_modules/sharp')
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#f6f1ff' } }).png().toBuffer()
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const card = { name: 'Мира', avatar: '🌸', level: 7, title: 'Росток', streak: 4, learned: 33, answers: 120, days: 150, secret: 'не должно утечь' }
const og = async (s, bytes, token = OWNER) => {
  const form = new FormData()
  form.append('file', new Blob([bytes]), 'og.png')
  return fetch(`${s.base}/api/public/og`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form })
}

describe('сервер: публичная визитка', () => {
  let s, coverId
  before(async () => (s = await start()))

  test('по умолчанию закрыта: открытые адреса отвечают 404 без токена', async () => {
    for (const u of ['/api/public/me', '/api/public/og.png', '/api/public/cover']) {
      const r = await s.call('GET', u)
      assert.equal(r.status, 404, u)
      assert.ok(!(r.headers.get('cache-control') ?? '').includes('max-age'), `закрытый ответ нельзя кэшировать: ${u}`)
    }
  })

  test('настройки только владельцу: без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/public/settings')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/public/settings', g.token)).status, 403)
    assert.equal((await s.call('PUT', '/api/public/settings', g.token, { enabled: true })).status, 403)
    assert.equal((await og(s, await png(1200, 630), g.token)).status, 403)
  })

  test('включение: видны только разрешённые поля, лишнее отброшено', async () => {
    assert.equal((await s.call('PUT', '/api/public/settings', OWNER, { enabled: 'да' })).status, 400)
    assert.equal((await s.call('PUT', '/api/public/settings', OWNER, { enabled: true, card })).status, 200)
    const me = await (await s.call('GET', '/api/public/me')).json()
    assert.deepEqual([me.name, me.level, me.streak, me.learned, me.days, me.cover], ['Мира', 7, 4, 33, 150, false])
    assert.ok(!('secret' in me))
  })

  test('картинка превью: только PNG 1200×630', async () => {
    assert.equal((await og(s, await png(100, 100))).status, 400)
    assert.equal((await og(s, Buffer.from('не картинка'))).status, 400)
    assert.equal((await og(s, await png(1200, 630))).status, 201)
    const r = await s.call('GET', '/api/public/og.png')
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'image/png')
    assert.equal((await s.call('GET', '/api/public/me').then(x => x.json())).hasOg, true)
    assert.match(r.headers.get('cache-control'), /max-age=300/)
  })

  test('обложка: открыта только та, которую разрешили, и только пока визитка включена', async () => {
    const img = await (await s.upload(OWNER, PNG1, 'c.png', 'Обложка кабинета', { kind: 'cover' })).json()
    coverId = img.id
    assert.equal((await s.call('GET', '/api/public/cover')).status, 404) // не разрешена
    assert.equal((await s.call('PUT', '/api/public/settings', OWNER, { enabled: true, cover: 'ffffffffffffffff' })).status, 400)
    const note = await (await s.upload(OWNER, PNG1, 'n.png', '', { kind: 'note' })).json()
    assert.equal((await s.call('PUT', '/api/public/settings', OWNER, { enabled: true, cover: note.id })).status, 400) // не обложка
    assert.equal((await s.call('PUT', '/api/public/settings', OWNER, { enabled: true, cover: coverId })).status, 200)
    const r = await s.call('GET', '/api/public/cover')
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-type'), 'image/png')
    // остальные картинки по-прежнему закрыты токеном
    assert.equal((await s.call('GET', `/api/images/${coverId}/file`)).status, 401)
    assert.equal((await s.call('GET', '/api/public/me').then(x => x.json())).cover, true)
  })

  test('выключение закрывает всё сразу', async () => {
    assert.equal((await s.call('PUT', '/api/public/settings', OWNER, { enabled: false })).status, 200)
    for (const u of ['/api/public/me', '/api/public/og.png', '/api/public/cover']) assert.equal((await s.call('GET', u)).status, 404, u)
    const st = await (await s.call('GET', '/api/public/settings', OWNER)).json()
    assert.deepEqual([st.enabled, st.hasOg], [false, true])
  })
})
