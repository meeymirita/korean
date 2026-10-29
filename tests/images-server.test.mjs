import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Настоящий PNG 1×1 пиксель. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const files = async (dir, sub) => readdir(path.join(dir, sub)).catch(() => [])

describe('сервер: картинки', () => {
  let s
  before(async () => (s = await start()))

  test('без токена закрыто, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/images')).status, 401)
    assert.equal((await s.upload(null, PNG)).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/images', g.token)).status, 403)
    assert.equal((await s.upload(g.token, PNG)).status, 403)
  })

  test('пока картинок нет, список пустой и видны лимиты', async () => {
    const l = await (await s.call('GET', '/api/images', OWNER)).json()
    assert.deepEqual([l.items, l.used, l.limit, l.maxFile], [[], 0, 500 * 1024 * 1024, 50 * 1024 * 1024])
  })

  let id
  test('загрузка: файл и миниатюра на диске, запись в базе, размеры определены', async () => {
    const res = await s.upload(OWNER, PNG, 'кот.png', '  Мой кот  ')
    assert.equal(res.status, 201)
    const img = await res.json()
    id = img.id
    assert.match(id, /^[a-f0-9]{16}$/)
    assert.deepEqual([img.name, img.caption, img.mime, img.size, img.width, img.height], ['кот.png', 'Мой кот', 'image/png', PNG.length, 1, 1])
    assert.deepEqual(await files(s.dir, 'uploads'), [`${id}.png`])
    assert.deepEqual(await files(s.dir, 'thumbs'), [`${id}.webp`])
    const l = await (await s.call('GET', '/api/images', OWNER)).json()
    assert.equal(l.items.length, 1)
    assert.equal(l.used, PNG.length)
  })

  test('оригинал и миниатюра отдаются с токеном и верным типом', async () => {
    const file = await s.call('GET', `/api/images/${id}/file`, OWNER)
    assert.equal(file.status, 200)
    assert.equal(file.headers.get('content-type'), 'image/png')
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG)
    const thumb = await s.call('GET', `/api/images/${id}/thumb`, OWNER)
    assert.equal(thumb.headers.get('content-type'), 'image/webp')
    assert.equal((await s.call('GET', `/api/images/${id}/file`)).status, 401)
  })

  test('подпись можно изменить; слишком длинная — 400', async () => {
    assert.equal((await s.call('PATCH', `/api/images/${id}`, OWNER, { caption: 'Новая подпись' })).status, 200)
    assert.equal((await (await s.call('GET', '/api/images', OWNER)).json()).items[0].caption, 'Новая подпись')
    assert.equal((await s.call('PATCH', `/api/images/${id}`, OWNER, { caption: 'я'.repeat(201) })).status, 400)
    assert.equal((await s.call('PATCH', '/api/images/0000000000000000', OWNER, { caption: 'x' })).status, 404)
  })

  test('не картинки и битые файлы не принимаются', async () => {
    const cases = {
      'текст под видом png': [Buffer.from('просто текст'), 'a.png'],
      'svg': [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'a.svg'],
      'html': [Buffer.from('<html><script>alert(1)</script></html>'), 'a.jpg'],
      'начало png без содержимого': [PNG.subarray(0, 20), 'a.png'],
      'пустой файл': [Buffer.alloc(0), 'a.png'],
    }
    for (const [name, [bytes, file]] of Object.entries(cases)) assert.equal((await s.upload(OWNER, bytes, file)).status, 400, name)
    const noFile = await fetch(s.base + '/api/images', { method: 'POST', headers: { Authorization: `Bearer ${OWNER}` }, body: new FormData() })
    assert.equal(noFile.status, 400)
    assert.equal((await (await s.call('GET', '/api/images', OWNER)).json()).items.length, 1, 'ничего лишнего не сохранилось')
    assert.deepEqual(await files(s.dir, 'uploads'), [`${id}.png`])
  })

  test('файл больше 50 МБ — 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(51 * 1024 * 1024)])
    assert.equal((await s.upload(OWNER, big)).status, 413)
    assert.equal((await (await s.call('GET', '/api/images', OWNER)).json()).items.length, 1)
  })

  test('чужой id и попытка выйти из папки — 404, файлы базы не отдаются', async () => {
    for (const bad of ['0000000000000000', 'abc', '..%2f..%2fapp.db', '../app.db']) {
      assert.equal((await s.call('GET', `/api/images/${bad}/file`, OWNER)).status, 404, bad)
    }
  })

  test('удаление убирает запись и оба файла', async () => {
    assert.equal((await s.call('DELETE', `/api/images/${id}`, OWNER)).status, 200)
    assert.deepEqual(await files(s.dir, 'uploads'), [])
    assert.deepEqual(await files(s.dir, 'thumbs'), [])
    assert.equal((await s.call('GET', `/api/images/${id}/file`, OWNER)).status, 404)
    assert.equal((await s.call('DELETE', `/api/images/${id}`, OWNER)).status, 404)
  })

  test('общий лимит: сверх квоты — 413', async () => {
    const t = await start({ env: { IMAGES_QUOTA_MB: '0.0001' } }) // около 105 байт
    assert.equal((await t.upload(OWNER, PNG)).status, 201)
    assert.equal((await t.upload(OWNER, PNG)).status, 413)
    assert.equal((await (await t.call('GET', '/api/images', OWNER)).json()).items.length, 1)
  })

  test('картинки переживают перезапуск сервера', async () => {
    const t = await start()
    const img = await (await t.upload(OWNER, PNG, 'a.png')).json()
    await t.stop()
    const again = await start({ dir: t.dir })
    assert.equal((await again.call('GET', `/api/images/${img.id}/file`, OWNER)).status, 200)
    await access(path.join(t.dir, 'uploads', `${img.id}.png`))
  })
})
