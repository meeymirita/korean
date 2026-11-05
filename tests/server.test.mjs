import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'
import { withDb } from './_db.mjs'

after(cleanup)

describe('сервер: вход по токену', () => {
  let s
  before(async () => (s = await start()))

  test('health открыт, остальное закрыто токеном', async () => {
    assert.equal((await s.call('GET', '/api/health')).status, 200)
    assert.equal((await s.call('GET', '/api/notes')).status, 401)
    assert.equal((await s.call('GET', '/api/notes', 'wrong-token')).status, 401)
    assert.equal((await s.call('GET', '/api/nothing', OWNER)).status, 404)
  })

  test('владелец проходит, в ответе его роль', async () => {
    const res = await s.call('GET', '/api/notes', OWNER)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-role'), 'owner')
  })

  test('сервис подключился к изолированной схеме PostgreSQL', async () => {
    const rows = await withDb(s, db => db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name"))
    assert.ok(rows.some(row => row.table_name === 'meta'))
    assert.ok(rows.some(row => row.table_name === 'guests'))
    assert.ok(!(await readdir(s.dir)).includes('app.db'))
  })
})

describe('сервер: гостевые токены', () => {
  let s
  before(async () => (s = await start()))

  const create = async (body = { hours: 1, label: 'Лера' }) => (await s.call('POST', '/api/guests', OWNER, body)).json()

  test('владелец создаёт токен: токен показывается один раз, в базе только хэш', async () => {
    const g = await create()
    assert.ok(g.token && g.token.length >= 20)
    assert.equal(g.label, 'Лера')
    assert.ok(Math.abs(g.expires - g.created - 3600_000) < 1000)
    const row = await withDb(s, db => db.get('SELECT * FROM guests WHERE id = $1', g.id))
    assert.ok(!JSON.stringify(row).includes(g.token), 'сам токен в базу не пишется')
    assert.equal(row.hash.length, 64)
    const list = await (await s.call('GET', '/api/guests', OWNER)).json()
    assert.ok(list.some(x => x.id === g.id))
    assert.ok(list.every(x => !('token' in x) && !('hash' in x)))
  })

  test('гость заходит: роль, срок в заголовках, заметок владельца не видит', async () => {
    await s.call('PUT', '/api/notes', OWNER, { v: 1, updated: 5, notes: [{ id: 'a', title: 'Тайна', text: 'x', created: 1, updated: 1 }] })
    const g = await create()
    const res = await s.call('GET', '/api/notes', g.token)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-role'), 'guest')
    assert.equal(Number(res.headers.get('x-guest-expires')), g.expires)
    assert.deepEqual(await res.json(), {})
  })

  test('гость не может создавать, смотреть и удалять токены', async () => {
    const g = await create()
    assert.equal((await s.call('POST', '/api/guests', g.token, { hours: 1 })).status, 403)
    assert.equal((await s.call('GET', '/api/guests', g.token)).status, 403)
    assert.equal((await s.call('DELETE', `/api/guests/${g.id}`, g.token)).status, 403)
  })

  test('отзыв: после удаления токен перестаёт работать', async () => {
    const g = await create()
    assert.equal((await s.call('GET', '/api/notes', g.token)).status, 200)
    assert.equal((await s.call('DELETE', `/api/guests/${g.id}`, OWNER)).status, 200)
    assert.equal((await s.call('GET', '/api/notes', g.token)).status, 401)
    assert.equal((await s.call('DELETE', `/api/guests/${g.id}`, OWNER)).status, 404)
  })

  test('срок от 0,1 часа до 30 суток, иначе 400; имя режется до 40 символов', async () => {
    for (const hours of [0, -1, 0.01, 721, 'много', undefined]) {
      assert.equal((await s.call('POST', '/api/guests', OWNER, { hours })).status, 400, String(hours))
    }
    assert.equal((await s.call('POST', '/api/guests', OWNER, { hours: 168 })).status, 201)
    assert.equal((await create({ hours: 1, label: 'я'.repeat(100) })).label.length, 40)
  })

  test('не больше 30 действующих токенов', async () => {
    const t = await start()
    for (let i = 0; i < 30; i++) assert.equal((await t.call('POST', '/api/guests', OWNER, { hours: 1 })).status, 201)
    assert.equal((await t.call('POST', '/api/guests', OWNER, { hours: 1 })).status, 400)
  })

  test('токены переживают перезапуск сервера', async () => {
    const first = await start()
    const g = await (await first.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    await first.stop()
    const second = await start({ dir: first.dir })
    assert.equal((await second.call('GET', '/api/notes', g.token)).status, 200)
  })

  test('срок вышел: 401 «expired», неизвестный токен — «unauthorized», в списке просроченных нет', async () => {
    const g = await create()
    await withDb(s, db => db.run('UPDATE guests SET expires = $1 WHERE id = $2', Date.now() - 3600_000, g.id))
    const old = await s.call('GET', '/api/notes', g.token)
    assert.equal(old.status, 401)
    assert.equal((await old.json()).error, 'expired')
    assert.equal((await (await s.call('GET', '/api/notes', 'other-token')).json()).error, 'unauthorized')
    const list = await (await s.call('GET', '/api/guests', OWNER)).json()
    assert.ok(!list.some(x => x.id === g.id))
  })

  test('в журнале событий остаются создание, отзыв и неверный токен', async () => {
    const t = await start()
    const g = await (await t.call('POST', '/api/guests', OWNER, { hours: 1, label: 'Журнал' })).json()
    await t.call('DELETE', `/api/guests/${g.id}`, OWNER)
    await t.call('GET', '/api/notes', 'bad-token')
    const types = await withDb(t, async db => (await db.all('SELECT type FROM events ORDER BY id')).map(r => r.type))
    assert.deepEqual(types, ['guest_created', 'guest_revoked', 'bad_token'])
  })
})

describe('сервер: заметки', () => {
  let s
  before(async () => (s = await start()))

  const note = (id, extra = {}) => ({ id, title: 'Название', text: 'Описание', created: 1, updated: 2, ...extra })
  const body = (notes, updated = 10) => ({ v: 1, updated, notes })

  test('без токена и с чужим токеном заметки закрыты', async () => {
    assert.equal((await s.call('GET', '/api/notes')).status, 401)
    assert.equal((await s.call('PUT', '/api/notes', 'wrong-token', body([]))).status, 401)
  })

  test('пока заметок нет, сервер отдаёт пустой объект', async () => {
    assert.deepEqual(await (await s.call('GET', '/api/notes', OWNER)).json(), {})
  })

  test('владелец сохраняет и читает заметки, лишние поля отбрасываются', async () => {
    const put = await s.call('PUT', '/api/notes', OWNER, body([note('a', { x: 'лишнее' }), note('b', { title: 'Вторая', created: 5 })], 77))
    assert.equal(put.status, 200)
    const got = await (await s.call('GET', '/api/notes', OWNER)).json()
    assert.equal(got.updated, 77)
    assert.deepEqual(got.notes.map(n => n.id), ['b', 'a'], 'новые сверху')
    assert.ok(!('x' in got.notes[0]))
  })

  test('список заменяется целиком: удалённая заметка пропадает', async () => {
    await s.call('PUT', '/api/notes', OWNER, body([note('a')], 80))
    assert.deepEqual((await (await s.call('GET', '/api/notes', OWNER)).json()).notes.map(n => n.id), ['a'])
  })

  test('картинки заметки сохраняются; мусорные id и больше 10 штук — 400', async () => {
    const id = n => n.toString(16).padStart(16, '0')
    await s.call('PUT', '/api/notes', OWNER, body([note('p', { images: [id(1), id(2)] }), note('q')], 90))
    const got = (await (await s.call('GET', '/api/notes', OWNER)).json()).notes
    assert.deepEqual(got.find(n => n.id === 'p').images, [id(1), id(2)])
    assert.deepEqual(got.find(n => n.id === 'q').images, [], 'у старой заметки без поля список пустой')
    for (const images of [['../../x'], [5], 'строка', Array.from({ length: 11 }, (_, i) => id(i))]) {
      assert.equal((await s.call('PUT', '/api/notes', OWNER, body([note('p', { images })], 91))).status, 400, JSON.stringify(images))
    }
    await s.call('PUT', '/api/notes', OWNER, body([note('a')], 92))
  })

  test('гость заметок не видит, а его запись игнорируется', async () => {
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.deepEqual(await (await s.call('GET', '/api/notes', g.token)).json(), {})
    const put = await s.call('PUT', '/api/notes', g.token, body([note('гость')], 999))
    assert.equal(put.status, 200)
    assert.equal((await put.json()).guest, true)
    assert.deepEqual((await (await s.call('GET', '/api/notes', OWNER)).json()).notes.map(n => n.id), ['a'])
  })

  test('нарушение лимитов и формата — 400, прежние заметки остаются', async () => {
    const bad = [
      body(Array.from({ length: 201 }, (_, i) => note('n' + i))),
      body([note('a', { title: 'я'.repeat(101) })]),
      body([note('a', { text: 'я'.repeat(5001) })]),
      body([note('a'), note('a')]),
      body([note('')]),
      body([{ id: 'a', title: 'x' }]),
      body([note('a', { created: 'вчера' })]),
      { v: 2, notes: [] },
      { v: 1, notes: 'нет' },
    ]
    for (const b of bad) assert.equal((await s.call('PUT', '/api/notes', OWNER, b)).status, 400, JSON.stringify(b).slice(0, 60))
    assert.equal((await (await s.call('GET', '/api/notes', OWNER)).json()).notes.length, 1)
  })

  test('границы лимитов проходят: 200 заметок, название 100, описание 5000', async () => {
    const edge = Array.from({ length: 200 }, (_, i) => note('n' + i, { title: 'я'.repeat(100), text: 'я'.repeat(5000) }))
    assert.equal((await s.call('PUT', '/api/notes', OWNER, body(edge))).status, 200)
  })

  test('не JSON — 400, чужой метод — 404/405, слишком большое тело — 413', async () => {
    const raw = await fetch(s.base + '/api/notes', { method: 'PUT', headers: { Authorization: `Bearer ${OWNER}`, 'Content-Type': 'application/json' }, body: 'не json' })
    assert.equal(raw.status, 400)
    assert.ok([404, 405].includes((await s.call('DELETE', '/api/notes', OWNER)).status))
    const huge = body([note('big', { text: 'я'.repeat(5 * 1024 * 1024) })])
    assert.equal((await s.call('PUT', '/api/notes', OWNER, huge)).status, 413)
    assert.equal((await (await s.call('GET', '/api/notes', OWNER)).json()).notes.length, 200)
  })
})

describe('сервер: новая схема PostgreSQL', () => {
  test('Prisma создал таблицы и новые поля в изолированной схеме', async () => {
    const t = await start()
    const columns = await withDb(t, db => db.all("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()"))
    assert.ok(columns.some(row => row.table_name === 'notes' && row.column_name === 'images'))
    assert.ok(columns.some(row => row.table_name === 'images' && row.column_name === 'description'))
    assert.ok(columns.some(row => row.table_name === 'plan_files' && row.column_name === 'plan_id'))
  })
})

describe('сервер: health и Swagger', () => {
  test('health проверяет базу и отвечает ok; Swagger по умолчанию выключен', async () => {
    const s = await start()
    const res = await s.call('GET', '/api/health')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
    assert.notEqual((await s.call('GET', '/api/docs')).status, 200)
    assert.notEqual((await s.call('GET', '/api/docs-json')).status, 200)
  })

  test('SWAGGER=1: страница и описание API, группы по разделу адреса, строгий CSP у остального API', async () => {
    const s = await start({ env: { SWAGGER: '1' } })
    const page = await s.call('GET', '/api/docs/')
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/)
    const doc = await (await s.call('GET', '/api/docs-json')).json()
    assert.ok(doc.paths['/api/health'] && doc.paths['/api/notes'])
    assert.deepEqual(doc.paths['/api/notes'].get.tags, ['notes'])
    assert.ok(doc.components.securitySchemes.bearer)
    assert.match((await s.call('GET', '/api/health')).headers.get('content-security-policy'), /default-src 'none'/)
  })
})
