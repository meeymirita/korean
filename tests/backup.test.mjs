import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPrismaClient } from './_db.mjs'
import { dropSchema } from './_server.mjs'

const script = fileURLToPath(new URL('../scripts/backup.sh', import.meta.url))
let root, out, schema, databaseUrl, prisma
const data = () => path.join(root, 'backend/data')
const run = (env = {}) => spawnSync('bash', [script], {
  env: { ...process.env, ROOT: root, BACKUP_DIR: out, DATA_DIR: data(), DATABASE_URL: databaseUrl, PG_DUMP_DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL, PG_DUMP_SCHEMA: schema, ...env },
  encoding: 'utf8',
})
const snaps = () => readdirSync(out).filter(n => /^20\d\d-\d\d-\d\d_\d{6}$/.test(n)).sort()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

before(async () => {
  const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
  assert.ok(base, 'для проверки бэкапа нужен PostgreSQL URL')
  schema = `backup_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
  const cleanUrl = new URL(base)
  cleanUrl.searchParams.delete('schema')
  databaseUrl = new URL(cleanUrl)
  databaseUrl.searchParams.set('schema', schema)
  prisma = createPrismaClient({ datasources: { db: { url: cleanUrl.toString() } } })
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
  await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."backup_notes" (id TEXT PRIMARY KEY, title TEXT NOT NULL)`)
  await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."backup_notes" VALUES ('1', 'Важная заметка')`)
  root = mkdtempSync(path.join(tmpdir(), 'bk-root-'))
  out = path.join(mkdtempSync(path.join(tmpdir(), 'bk-out-')), 'backups')
  mkdirSync(path.join(data(), 'uploads'), { recursive: true })
  mkdirSync(path.join(data(), 'docs'), { recursive: true })
  mkdirSync(path.join(data(), 'thumbs'), { recursive: true })
  writeFileSync(path.join(data(), 'uploads/a.png'), 'картинка')
  writeFileSync(path.join(data(), 'docs/d.pdf'), '%PDF-1.4')
  writeFileSync(path.join(data(), 'thumbs/a.webp'), 'миниатюра')
  writeFileSync(path.join(root, 'backend/.env'), 'DATABASE_URL=скрытый-секрет\n')
})

after(async () => {
  if (prisma) {
    await dropSchema(prisma, schema)
    await prisma.$disconnect()
  }
  if (root) rmSync(root, { recursive: true, force: true })
  if (out) rmSync(path.dirname(out), { recursive: true, force: true })
})

describe('резервная копия PostgreSQL (scripts/backup.sh)', () => {
  test('копия содержит восстанавливаемый дамп, файлы, настройки и описание', () => {
    const result = run()
    assert.equal(result.status, 0, result.stderr)
    const [snapshot] = snaps()
    const dir = path.join(out, snapshot)
    const restored = spawnSync('pg_restore', ['--list', path.join(dir, 'app.dump')], { encoding: 'utf8' })
    assert.equal(restored.status, 0, restored.stderr)
    assert.match(restored.stdout, /backup_notes/)
    assert.equal(readFileSync(path.join(dir, 'files/uploads/a.png'), 'utf8'), 'картинка')
    assert.ok(existsSync(path.join(dir, 'files/docs/d.pdf')))
    assert.equal(readFileSync(path.join(dir, 'files/thumbs/a.webp'), 'utf8'), 'миниатюра')
    assert.equal(readFileSync(path.join(dir, 'config/server.env'), 'utf8'), 'DATABASE_URL=скрытый-секрет\n')
    assert.equal(statSync(path.join(dir, 'config/server.env')).mode & 0o077, 0, '.env закрыт для остальных пользователей')
    assert.match(readFileSync(path.join(dir, 'manifest.txt'), 'utf8'), /sha256 [a-f0-9]{64}/)
  })

  test('статус записан для кабинета', () => {
    const status = JSON.parse(readFileSync(path.join(data(), 'backup-status.json'), 'utf8'))
    assert.equal(status.ok, true)
    assert.ok(Math.abs(Date.now() - status.time) < 60_000)
    assert.equal(status.offsite, false)
    assert.ok(status.sizeKb > 0)
  })

  test('неизменённые файлы хранятся один раз через жёсткие ссылки', async () => {
    await sleep(1100)
    assert.equal(run().status, 0)
    const [first, second] = snaps()
    assert.equal(statSync(path.join(out, first, 'files/uploads/a.png')).ino, statSync(path.join(out, second, 'files/uploads/a.png')).ino)
  })

  test('новые записи базы попадают в следующую копию работающей PostgreSQL', async () => {
    await prisma.$executeRawUnsafe(`INSERT INTO "${schema}"."backup_notes" VALUES ('2', 'Свежая запись')`)
    await sleep(1100)
    assert.equal(run().status, 0)
    const last = snaps().at(-1)
    const restored = spawnSync('pg_restore', ['--list', path.join(out, last, 'app.dump')], { encoding: 'utf8' })
    assert.equal(restored.status, 0, restored.stderr)
    const dbArchive = path.join(out, last, 'app.dump')
    const cleanUrl = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
    cleanUrl.searchParams.delete('schema')
    const restore = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', cleanUrl.toString(), dbArchive], { encoding: 'utf8' })
    assert.equal(restore.status, 0, restore.stderr)
    const count = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${schema}"."backup_notes"`)
    assert.equal(count[0].n, 2)
  })

  test('хранятся только последние копии из лимита', async () => {
    await sleep(1100)
    assert.equal(run({ KEEP: '2' }).status, 0)
    assert.equal(snaps().length, 2)
  })

  test('ошибка pg_dump пишет неуспешный статус и не оставляет временный каталог', () => {
    const before = snaps()
    const result = run({ PG_DUMP_BIN: '/не/существует/pg_dump' })
    assert.notEqual(result.status, 0)
    assert.deepEqual(snaps(), before)
    assert.ok(!readdirSync(out).some(name => name.endsWith('.tmp')))
    const status = JSON.parse(readFileSync(path.join(data(), 'backup-status.json'), 'utf8'))
    assert.equal(status.ok, false)
  })
})

describe('установка ночного таймера (scripts/install-backup-timer.sh)', () => {
  const installer = fileURLToPath(new URL('../scripts/install-backup-timer.sh', import.meta.url))

  test('синтаксис верный, --print показывает службу и таймер и ничего не устанавливает', () => {
    assert.equal(spawnSync('bash', ['-n', installer]).status, 0)
    const result = spawnSync('bash', [installer, '--print'], { encoding: 'utf8', env: { ...process.env, ROOT: '/var/sites/korean' } })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /ExecStart=\/bin\/bash \/var\/sites\/korean\/scripts\/backup-docker\.sh/)
    assert.match(result.stdout, /OnCalendar=\*-\*-\* 03:30:00/)
    assert.match(result.stdout, /Persistent=true/)
  })

  test('без root таймер не устанавливается', { skip: process.getuid?.() === 0 }, () => {
    const result = spawnSync('bash', [installer], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /root/)
  })
})
