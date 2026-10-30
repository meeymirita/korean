import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

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

  test('база создаётся сама, ежедневная копия базы лежит в backups', async () => {
    const files = await readdir(path.join(s.dir, 'backups'))
    assert.ok(files.some(f => /^app-\d{4}-\d\d-\d\d\.db$/.test(f)), files.join(', '))
    assert.ok((await readdir(s.dir)).includes('app.db'))
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
    const db = new DatabaseSync(path.join(s.dir, 'app.db'), { readOnly: true })
    const row = db.prepare('SELECT * FROM guests WHERE id = ?').get(g.id)
    db.close()
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
    const db = new DatabaseSync(path.join(s.dir, 'app.db'))
    db.prepare('UPDATE guests SET expires = ? WHERE id = ?').run(Date.now() - 3600_000, g.id)
    db.close()
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
    const db = new DatabaseSync(path.join(t.dir, 'app.db'), { readOnly: true })
    const types = db.prepare('SELECT type FROM events ORDER BY id').all().map(r => r.type)
    db.close()
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

describe('сервер: база старой версии обновляется сама', () => {
  test('в старой базе нет новых столбцов: после запуска заметки с картинками и описания картинок работают, старые данные целы', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(path.join(tmpdir(), 'server-old-'))
    try {
      const old = new DatabaseSync(path.join(dir, 'app.db'))
      old.exec(`
        CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
        CREATE TABLE images (id TEXT PRIMARY KEY, name TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL, ext TEXT NOT NULL,
          size INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO notes VALUES ('old', 'Старая', 'текст', 1, 1);
        INSERT INTO meta VALUES ('notes_updated', '5');
        INSERT INTO images VALUES ('0123456789abcdef', 'a.png', 'Кот', 'image/png', 'png', 10, 1, 1, 1);
      `)
      old.close()
      const s = await start({ dir })
      const notes = (await (await s.call('GET', '/api/notes', OWNER)).json()).notes
      assert.deepEqual(notes.map(n => [n.id, n.images]), [['old', []]])
      const imgs = (await (await s.call('GET', '/api/images', OWNER)).json()).items
      assert.deepEqual([imgs[0].caption, imgs[0].description], ['Кот', ''])
      assert.equal((await s.call('PATCH', '/api/images/0123456789abcdef', OWNER, { description: 'новое' })).status, 200)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('сервер: разнос старых картинок по назначению', () => {
  test('картинки из заметок и обложка кабинета уходят из общего списка при первом запуске новой версии', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(path.join(tmpdir(), 'server-kind-'))
    try {
      const old = new DatabaseSync(path.join(dir, 'app.db'))
      old.exec(`
        CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, images TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL);
        CREATE TABLE images (id TEXT PRIMARY KEY, name TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL, ext TEXT NOT NULL,
          size INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO notes VALUES ('n1', 'С картинкой', '', '["aaaaaaaaaaaaaaaa"]', 1, 1);
        INSERT INTO notes VALUES ('n2', 'Битая', '', 'не json', 1, 1);
        INSERT INTO meta VALUES ('notes_updated', '5');
        INSERT INTO meta VALUES ('profile', '{"name":"","avatar":"🌸","cover":"cccccccccccccccc"}');
        INSERT INTO images VALUES ('aaaaaaaaaaaaaaaa', 'в-заметке.png', '', '', 'image/png', 'png', 10, 1, 1, 1);
        INSERT INTO images VALUES ('bbbbbbbbbbbbbbbb', 'в-галерее.png', 'Кот', '', 'image/png', 'png', 10, 1, 1, 2);
        INSERT INTO images VALUES ('cccccccccccccccc', 'обложка.png', '', '', 'image/png', 'png', 10, 1, 1, 3);
      `)
      old.close()
      const s = await start({ dir })
      const list = async kind => (await (await s.call('GET', '/api/images' + (kind ? `?kind=${kind}` : ''), OWNER)).json()).items.map(i => i.id)
      assert.deepEqual(await list(), ['bbbbbbbbbbbbbbbb'], 'в «Картинках» осталась только своя')
      assert.deepEqual(await list('note'), ['aaaaaaaaaaaaaaaa'])
      assert.deepEqual(await list('cover'), ['cccccccccccccccc'])
      await s.stop()
      const again = await start({ dir }) // повторный запуск ничего не двигает
      assert.deepEqual(await (await again.call('GET', '/api/images', OWNER)).json().then(d => d.items.map(i => i.id)), ['bbbbbbbbbbbbbbbb'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
