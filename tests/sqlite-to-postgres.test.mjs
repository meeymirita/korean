import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createPrismaClient } from './_db.mjs'
import { dropSchema } from './_server.mjs'

const CLI = fileURLToPath(new URL('../backend/node_modules/prisma/build/index.js', import.meta.url))
const BACKEND = fileURLToPath(new URL('../backend/', import.meta.url))
const { migrate } = await import('../backend/scripts/sqlite-to-postgres.mjs')
const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

/** Схема SQLite такой, какой она была у боевой базы до перехода на PostgreSQL (в том числе столбцы, добавленные позже через ALTER). */
const OLD_SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE answers (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, word TEXT, ok INTEGER NOT NULL, source TEXT NOT NULL, mode TEXT NOT NULL DEFAULT '', xp INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT '');
CREATE TABLE words (word TEXT PRIMARY KEY, ok INTEGER NOT NULL DEFAULT 0, bad INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last INTEGER NOT NULL DEFAULT 0, kd INTEGER);
CREATE TABLE days (day TEXT PRIMARY KEY, ok INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0);
CREATE TABLE study_time (day TEXT PRIMARY KEY, seconds INTEGER NOT NULL DEFAULT 0);
CREATE TABLE guests (id TEXT PRIMARY KEY, hash TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, images TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE images (id TEXT PRIMARY KEY, name TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'gallery', mime TEXT NOT NULL, ext TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, type TEXT NOT NULL, info TEXT NOT NULL DEFAULT '');
CREATE TABLE plans (id TEXT PRIMARY KEY, day TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'own');
CREATE TABLE plan_files (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, ext TEXT NOT NULL, size INTEGER NOT NULL, thumb INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE today_sets (id TEXT PRIMARY KEY, day TEXT NOT NULL, right_n INTEGER NOT NULL, total_n INTEGER NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE coin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', ref TEXT UNIQUE);
CREATE TABLE site_images (key TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, mime TEXT NOT NULL DEFAULT '', x REAL NOT NULL DEFAULT 50, y REAL NOT NULL DEFAULT 50, zoom REAL NOT NULL DEFAULT 1, v INTEGER NOT NULL DEFAULT 1);
CREATE TABLE nb_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, parent TEXT, tpl TEXT NOT NULL DEFAULT 'blank', text TEXT NOT NULL DEFAULT '', strokes TEXT NOT NULL DEFAULT '[]', fav INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
`

let dir, schema, admin, target
const q = n => `"${n}"`

const prisma = async () => {
  admin ??= createPrismaClient({ datasources: { db: { url } } })
  return admin
}
const newSchema = async () => {
  const name = `conv_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  await (await prisma()).$executeRawUnsafe(`CREATE SCHEMA ${q(name)}`)
  const u = new URL(url)
  u.searchParams.set('schema', name)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'migrate', 'deploy'], { cwd: BACKEND, env: { ...process.env, DATABASE_URL: u.toString() }, stdio: 'pipe' })
    child.once('close', code => (code === 0 ? resolve() : reject(new Error('migrate deploy: ' + code))))
  })
  return { name, url: u.toString() }
}
const count = async (table, s = schema) => Number((await (await prisma()).$queryRawUnsafe(`SELECT count(*)::int AS n FROM ${q(s)}.${q(table)}`))[0].n)

/** База с «трудными» значениями: пустые, юникод, кавычки, переводы строк, большие числа, пропуски в нумерации. */
function makeSqlite(file) {
  const db = new DatabaseSync(file)
  db.exec(OLD_SCHEMA)
  const meta = db.prepare('INSERT INTO meta VALUES (?, ?)')
  meta.run('xp', '4'); meta.run('profile', JSON.stringify({ name: 'мира', avatar: '🦊', cover: '' })); meta.run('note', "кавычка ' и \" и \\ и\nперевод строки")
  const ans = db.prepare('INSERT INTO answers (id, t, word, ok, source, mode, xp, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  ans.run(5, 1793900000000, '사람', 1, 'game', 'mix', 10, '')
  ans.run(9, 1793900000001, null, 0, 'today', '', 0, '{"q":"?","a":"이/가"}')
  ans.run(40, 9007199254740, '신제품', 1, 'trainer', 'build', 25, '')
  db.prepare('INSERT INTO words VALUES (?, ?, ?, ?, ?, ?)').run('사람', 3, 1, 2, 1793900000000, 1793800000000)
  db.prepare('INSERT INTO words VALUES (?, ?, ?, ?, ?, ?)').run('하다', 0, 0, 0, 0, null)
  db.prepare('INSERT INTO days VALUES (?, ?, ?)').run('2026-11-05', 3, 4)
  db.prepare('INSERT INTO study_time VALUES (?, ?)').run('2026-11-05', 321)
  db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?)').run('n1', 'Заметка', 'текст\nс переносом', '["i1"]', 1, 2, '["a"]')
  db.prepare('INSERT INTO images VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('i1', 'кот.png', 'Кот', '', 'gallery', 'image/png', 'png', 123456, 10, 20, 1793900000000, '[]')
  db.prepare('INSERT INTO events (id, t, type, info) VALUES (?, ?, ?, ?)').run(3, 1, 'login', '1.2.3.4')
  db.prepare('INSERT INTO coin_log (id, t, day, kind, amount, reason, ref) VALUES (?, ?, ?, ?, ?, ?, ?)').run(7, 1, '2026-11-05', 'gift', 100, 'старт', 'gift:start')
  db.prepare('INSERT INTO coin_log (id, t, day, kind, amount, reason, ref) VALUES (?, ?, ?, ?, ?, ?, ?)').run(8, 2, '2026-11-05', 'buy', -15, 'hint', null)
  db.prepare('INSERT INTO site_images VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('block-words', 'file', 'block-words-2.webp', 'image/webp', 6.5, 0.0, 1.0, 2)
  db.prepare('INSERT INTO nb_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('f1', 'folder', 'Папка', null, 'blank', '', '[]', 0, 1, 2)
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('h1', 1, 2)
  db.close()
}

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'conv-'))
  makeSqlite(path.join(dir, 'app.db'))
  target = await newSchema()
  schema = target.name
})
after(async () => {
  if (admin) {
    await dropSchema(admin, schema)
    await admin.$disconnect()
  }
  await rm(dir, { recursive: true, force: true })
})

describe('перенос SQLite → PostgreSQL (backend/scripts/sqlite-to-postgres.mjs)', () => {
  const run = (extra = {}) => migrate({ sqlitePath: path.join(dir, 'app.db'), url: target.url, log: () => {}, ...extra })

  test('все таблицы переносятся и сверяются по строкам, суммам и хэшам', async () => {
    const r = await run()
    assert.equal(r.ok, true)
    assert.equal(await count('answers'), 3)
    assert.equal(await count('words'), 2)
    assert.equal(await count('coin_log'), 2)
    assert.equal(r.report.length, 16)
  })

  test('значения сохранились: юникод, пустые, большие числа, дробные, переводы строк', async () => {
    const p = await prisma()
    const [a] = await p.$queryRawUnsafe(`SELECT * FROM ${q(schema)}.answers WHERE id = 40`)
    assert.equal(a.word, '신제품')
    assert.equal(Number(a.t), 9007199254740)
    const [n] = await p.$queryRawUnsafe(`SELECT value FROM ${q(schema)}.meta WHERE key = 'note'`)
    assert.equal(n.value, "кавычка ' и \" и \\ и\nперевод строки")
    const [w] = await p.$queryRawUnsafe(`SELECT kd FROM ${q(schema)}.words WHERE word = '하다'`)
    assert.equal(w.kd, null)
    const [s] = await p.$queryRawUnsafe(`SELECT x, y FROM ${q(schema)}.site_images`)
    assert.deepEqual([s.x, s.y], [6.5, 0])
    const nul = await p.$queryRawUnsafe(`SELECT ref FROM ${q(schema)}.coin_log WHERE id = 8`)
    assert.equal(nul[0].ref, null)
  })

  test('счётчики автонумерации продолжаются после наибольшего старого id', async () => {
    const p = await prisma()
    await p.$executeRawUnsafe(`INSERT INTO ${q(schema)}.answers (t, ok, source) VALUES (1, 1, 'game')`)
    await p.$executeRawUnsafe(`INSERT INTO ${q(schema)}.events (t, type) VALUES (1, 'x')`)
    await p.$executeRawUnsafe(`INSERT INTO ${q(schema)}.coin_log (t, day, kind, amount) VALUES (1, 'd', 'k', 1)`)
    assert.equal(Number((await p.$queryRawUnsafe(`SELECT max(id) AS m FROM ${q(schema)}.answers`))[0].m), 41)
    assert.equal(Number((await p.$queryRawUnsafe(`SELECT max(id) AS m FROM ${q(schema)}.events`))[0].m), 4)
    assert.equal(Number((await p.$queryRawUnsafe(`SELECT max(id) AS m FROM ${q(schema)}.coin_log`))[0].m), 9)
  })

  test('повторная загрузка в непустую базу отказывает, ничего не меняя; --replace заменяет', async () => {
    await assert.rejects(run(), /уже есть данные/)
    assert.equal(await count('answers'), 4, 'строка, добавленная после переноса, цела')
    const r = await run({ replace: true })
    assert.equal(r.ok, true)
    assert.equal(await count('answers'), 3)
  })

  test('--check-only: совпадает сразу после загрузки, расхождение после правки в PostgreSQL находится', async () => {
    assert.equal((await run({ checkOnly: true })).ok, true)
    await (await prisma()).$executeRawUnsafe(`UPDATE ${q(schema)}.words SET ok = ok + 1 WHERE word = '사람'`)
    const r = await run({ checkOnly: true })
    assert.equal(r.ok, false)
    assert.ok(r.report.some(x => !x.ok && x.table === 'words'))
  })

  test('лишний столбец в SQLite не теряется молча, а останавливает перенос; база целиком откатывается', async () => {
    const file = path.join(dir, 'extra.db')
    makeSqlite(file)
    const db = new DatabaseSync(file)
    db.exec('ALTER TABLE words ADD COLUMN color TEXT')
    db.close()
    const fresh = await newSchema()
    try {
      await assert.rejects(migrate({ sqlitePath: file, url: fresh.url, log: () => {} }), /color/)
      assert.equal(await count('answers', fresh.name), 0)
    } finally {
      await dropSchema(await prisma(), fresh.name)
    }
  })

  test('нет таблиц PostgreSQL (миграции не применены): понятная ошибка, а не падение посреди переноса', async () => {
    const name = `conv_empty_${process.pid}`
    await (await prisma()).$executeRawUnsafe(`CREATE SCHEMA ${q(name)}`)
    const u = new URL(url)
    u.searchParams.set('schema', name)
    try {
      await assert.rejects(migrate({ sqlitePath: path.join(dir, 'app.db'), url: u.toString(), log: () => {} }), /нет таблицы/)
    } finally {
      await dropSchema(await prisma(), name)
    }
  })
})
