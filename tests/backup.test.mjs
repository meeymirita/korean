import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const script = fileURLToPath(new URL('../scripts/backup.sh', import.meta.url))
let root, out
const data = () => path.join(root, 'server/data')
const run = (env = {}) => spawnSync('bash', [script], { env: { ...process.env, ROOT: root, BACKUP_DIR: out, ...env }, encoding: 'utf8' })
const snaps = () => readdirSync(out).filter(n => /^20\d\d-\d\d-\d\d_\d{6}$/.test(n)).sort()
const sleep = ms => new Promise(r => setTimeout(r, ms))

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bk-root-'))
  out = path.join(mkdtempSync(path.join(tmpdir(), 'bk-out-')), 'backups')
  mkdirSync(path.join(data(), 'uploads'), { recursive: true })
  mkdirSync(path.join(data(), 'docs'), { recursive: true })
  mkdirSync(path.join(data(), 'thumbs'), { recursive: true })
  writeFileSync(path.join(data(), 'uploads/a.png'), 'картинка')
  writeFileSync(path.join(data(), 'docs/d.pdf'), '%PDF-1.4')
  writeFileSync(path.join(data(), 'thumbs/a.webp'), 'миниатюра')
  writeFileSync(path.join(root, 'server/.env'), 'PROGRESS_TOKEN=секрет\n')
  const db = new DatabaseSync(path.join(data(), 'app.db'))
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE notes (id TEXT, title TEXT); INSERT INTO notes VALUES (\'1\', \'Важная заметка\');')
  db.close()
})
after(() => rmSync(root, { recursive: true, force: true }))

describe('резервная копия (scripts/backup.sh)', () => {
  test('копия содержит целую базу, файлы, настройки и описание; лишнего нет', () => {
    const r = run()
    assert.equal(r.status, 0, r.stderr)
    const [snap] = snaps()
    const dir = path.join(out, snap)
    const copy = new DatabaseSync(path.join(dir, 'app.db'), { readOnly: true })
    assert.equal(copy.prepare('SELECT title FROM notes').get().title, 'Важная заметка')
    assert.equal(Object.values(copy.prepare('PRAGMA integrity_check').get())[0], 'ok')
    copy.close()
    assert.equal(readFileSync(path.join(dir, 'files/uploads/a.png'), 'utf8'), 'картинка')
    assert.ok(existsSync(path.join(dir, 'files/docs/d.pdf')))
    assert.equal(readFileSync(path.join(dir, 'files/thumbs/a.webp'), 'utf8'), 'миниатюра', 'миниатюры тоже в копии: после восстановления превью на месте')
    assert.equal(readFileSync(path.join(dir, 'config/server.env'), 'utf8'), 'PROGRESS_TOKEN=секрет\n')
    assert.equal(statSync(path.join(dir, 'config/server.env')).mode & 0o077, 0, '.env в копии закрыт для остальных пользователей')
    assert.match(readFileSync(path.join(dir, 'manifest.txt'), 'utf8'), /sha256 [a-f0-9]{64}/)
  })

  test('статус записан для кабинета', () => {
    const s = JSON.parse(readFileSync(path.join(data(), 'backup-status.json'), 'utf8'))
    assert.equal(s.ok, true)
    assert.ok(Math.abs(Date.now() - s.time) < 60_000)
    assert.equal(s.offsite, false)
    assert.ok(s.sizeKb > 0)
  })

  test('неизменённые файлы за разные дни хранятся один раз (жёсткие ссылки)', async () => {
    await sleep(1100)
    assert.equal(run().status, 0)
    const [a, b] = snaps()
    assert.equal(statSync(path.join(out, a, 'files/uploads/a.png')).ino, statSync(path.join(out, b, 'files/uploads/a.png')).ino)
  })

  test('новая запись в базе попадает в следующую копию, пока сервер «работает»', async () => {
    const live = new DatabaseSync(path.join(data(), 'app.db'))
    live.exec("INSERT INTO notes VALUES ('2', 'Свежая')") // база открыта на запись, как у работающего сервера
    await sleep(1100)
    assert.equal(run({ KEEP: '14' }).status, 0)
    const last = snaps().at(-1)
    const copy = new DatabaseSync(path.join(out, last, 'app.db'), { readOnly: true })
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM notes').get().n, 2)
    copy.close()
    live.close()
  })

  test('хранятся только последние KEEP копий', async () => {
    await sleep(1100)
    assert.equal(run({ KEEP: '2' }).status, 0)
    assert.equal(snaps().length, 2)
  })

  test('повреждённая база: копия не создаётся, в статусе ошибка, старые копии целы', () => {
    const before = snaps()
    writeFileSync(path.join(data(), 'app.db'), 'это не база данных'.repeat(500))
    rmSync(path.join(data(), 'app.db-wal'), { force: true })
    rmSync(path.join(data(), 'app.db-shm'), { force: true })
    const r = run()
    assert.notEqual(r.status, 0)
    assert.deepEqual(snaps(), before)
    assert.ok(!readdirSync(out).some(n => n.endsWith('.tmp')), 'временные папки убраны')
    const s = JSON.parse(readFileSync(path.join(data(), 'backup-status.json'), 'utf8'))
    assert.equal(s.ok, false)
  })
})
