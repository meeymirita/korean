import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = fileURLToPath(new URL('../server/index.mjs', import.meta.url))
const OWNER = 'owner-secret-for-tests'
const children = []
const dirs = []

const freePort = () =>
  new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

/** Запускает настоящий сервер на свободном порту с временной папкой данных. */
async function start(prepare) {
  const dir = await mkdtemp(path.join(tmpdir(), 'progress-test-'))
  dirs.push(dir)
  if (prepare) await prepare(dir)
  const port = await freePort()
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, PROGRESS_TOKEN: OWNER },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  children.push(child)
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve)
    child.once('exit', code => reject(new Error('сервер не запустился, код ' + code)))
  })
  const base = `http://127.0.0.1:${port}`
  const call = (method, url, token, body) =>
    fetch(base + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return { dir, base, call }
}

after(async () => {
  children.forEach(c => c.kill())
  await Promise.all(dirs.map(d => rm(d, { recursive: true, force: true })))
})

describe('сервер прогресса: владелец', () => {
  let s
  before(async () => (s = await start()))

  test('health открыт, остальное закрыто токеном', async () => {
    assert.equal((await s.call('GET', '/api/health')).status, 200)
    assert.equal((await s.call('GET', '/api/progress')).status, 401)
    assert.equal((await s.call('GET', '/api/progress', 'wrong-token')).status, 401)
    assert.equal((await s.call('GET', '/api/nothing', OWNER)).status, 404)
  })

  test('владелец читает и пишет прогресс', async () => {
    const put = await s.call('PUT', '/api/progress', OWNER, { v: 1, updated: 5, xp: 777 })
    assert.equal(put.status, 200)
    assert.equal(put.headers.get('x-role'), 'owner')
    const got = await s.call('GET', '/api/progress', OWNER)
    assert.equal((await got.json()).xp, 777)
  })

  test('плохие запросы: чужая версия и не JSON — 400', async () => {
    assert.equal((await s.call('PUT', '/api/progress', OWNER, { v: 2 })).status, 400)
    const res = await fetch(s.base + '/api/progress', { method: 'PUT', headers: { Authorization: `Bearer ${OWNER}` }, body: 'это не json' })
    assert.equal(res.status, 400)
  })
})

describe('сервер прогресса: гостевые токены', () => {
  let s
  before(async () => {
    s = await start()
    await s.call('PUT', '/api/progress', OWNER, { v: 1, updated: 5, xp: 777 })
  })

  const create = async (body = { hours: 1, label: 'Лера' }) => (await s.call('POST', '/api/guests', OWNER, body)).json()

  test('владелец создаёт токен: токен показывается один раз, на диске только хэш', async () => {
    const g = await create()
    assert.ok(g.token && g.token.length >= 20)
    assert.equal(g.label, 'Лера')
    assert.ok(Math.abs(g.expires - g.created - 3600_000) < 1000)
    const file = await readFile(path.join(s.dir, 'guests.json'), 'utf8')
    assert.ok(!file.includes(g.token), 'сам токен на диск не пишется')
    assert.ok(file.includes(createHash('sha256').update(g.token).digest('hex')))
    const list = await (await s.call('GET', '/api/guests', OWNER)).json()
    assert.ok(list.some(x => x.id === g.id))
    assert.ok(list.every(x => !('token' in x) && !('hash' in x)))
  })

  test('гость заходит, но видит пустой прогресс, а не данные владельца', async () => {
    const g = await create()
    const res = await s.call('GET', '/api/progress', g.token)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('x-role'), 'guest')
    assert.equal(Number(res.headers.get('x-guest-expires')), g.expires)
    assert.deepEqual(await res.json(), {})
  })

  test('гость ничего не записывает: ответ успешный, файл владельца цел', async () => {
    const g = await create()
    const put = await s.call('PUT', '/api/progress', g.token, { v: 1, updated: 99, xp: 1 })
    assert.equal(put.status, 200)
    assert.equal((await put.json()).guest, true)
    assert.equal((await (await s.call('GET', '/api/progress', OWNER)).json()).xp, 777)
  })

  test('гость не может создавать, смотреть и удалять токены', async () => {
    const g = await create()
    assert.equal((await s.call('POST', '/api/guests', g.token, { hours: 1 })).status, 403)
    assert.equal((await s.call('GET', '/api/guests', g.token)).status, 403)
    assert.equal((await s.call('DELETE', `/api/guests/${g.id}`, g.token)).status, 403)
  })

  test('отзыв: после удаления токен перестаёт работать', async () => {
    const g = await create()
    assert.equal((await s.call('GET', '/api/progress', g.token)).status, 200)
    assert.equal((await s.call('DELETE', `/api/guests/${g.id}`, OWNER)).status, 200)
    assert.equal((await s.call('GET', '/api/progress', g.token)).status, 401)
    assert.equal((await s.call('DELETE', `/api/guests/${g.id}`, OWNER)).status, 404)
  })

  test('срок задаётся от 0,1 часа до 30 суток, иначе 400', async () => {
    for (const hours of [0, -1, 0.01, 721, 'много', undefined]) {
      assert.equal((await s.call('POST', '/api/guests', OWNER, { hours })).status, 400, String(hours))
    }
    assert.equal((await s.call('POST', '/api/guests', OWNER, { hours: 168 })).status, 200)
  })

  test('имя гостя режется до 40 символов', async () => {
    assert.equal((await create({ hours: 1, label: 'я'.repeat(100) })).label.length, 40)
  })

  test('токены переживают перезапуск сервера', async () => {
    const first = await start()
    const g = await (await first.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    const saved = await readFile(path.join(first.dir, 'guests.json'))
    const second = await start(d => writeFile(path.join(d, 'guests.json'), saved))
    assert.equal((await second.call('GET', '/api/progress', g.token)).status, 200)
  })
})

describe('сервер прогресса: срок вышел', () => {
  test('просроченный токен — 401 «expired», неизвестный — 401 «unauthorized»', async () => {
    const token = 'expired-guest-token'
    const s = await start(d =>
      writeFile(
        path.join(d, 'guests.json'),
        JSON.stringify({ abcd1234: { hash: createHash('sha256').update(token).digest('hex'), label: '', created: Date.now() - 7200_000, expires: Date.now() - 3600_000 } }),
      ),
    )
    const old = await s.call('GET', '/api/progress', token)
    assert.equal(old.status, 401)
    assert.equal((await old.json()).error, 'expired')
    const unknown = await s.call('GET', '/api/progress', 'other-token')
    assert.equal((await unknown.json()).error, 'unauthorized')
    const list = await (await s.call('GET', '/api/guests', OWNER)).json()
    assert.deepEqual(list, [], 'в списке владельца просроченных нет')
  })
})

describe('сервер прогресса: заметки', () => {
  let s
  before(async () => (s = await start()))

  const note = (id, extra = {}) => ({ id, title: 'Название', text: 'Описание', created: 1, updated: 2, ...extra })
  const body = (notes, updated = 10) => ({ v: 1, updated, notes })

  test('без токена и с чужим токеном заметки закрыты', async () => {
    assert.equal((await s.call('GET', '/api/notes')).status, 401)
    assert.equal((await s.call('PUT', '/api/notes', 'wrong-token', body([]))).status, 401)
  })

  test('пока заметок нет, сервер отдаёт пустой объект', async () => {
    const res = await s.call('GET', '/api/notes', OWNER)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {})
  })

  test('владелец сохраняет и читает заметки, лишние поля отбрасываются', async () => {
    const put = await s.call('PUT', '/api/notes', OWNER, body([note('a', { x: 'лишнее' }), note('b', { title: 'Вторая' })], 77))
    assert.equal(put.status, 200)
    const got = await (await s.call('GET', '/api/notes', OWNER)).json()
    assert.equal(got.updated, 77)
    assert.deepEqual(got.notes.map(n => n.id), ['a', 'b'])
    assert.ok(!('x' in got.notes[0]))
    const file = JSON.parse(await readFile(path.join(s.dir, 'notes.json'), 'utf8'))
    assert.equal(file.notes.length, 2, 'лежит в notes.json')
  })

  test('вторая запись создаёт ежедневную копию заметок', async () => {
    await s.call('PUT', '/api/notes', OWNER, body([note('a')], 78))
    const files = await (await import('node:fs/promises')).readdir(path.join(s.dir, 'backups'))
    assert.ok(files.some(f => f.startsWith('notes-')), files.join(', '))
  })

  test('гость заметок не видит, а его запись игнорируется', async () => {
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.deepEqual(await (await s.call('GET', '/api/notes', g.token)).json(), {})
    const put = await s.call('PUT', '/api/notes', g.token, body([note('гость')], 999))
    assert.equal(put.status, 200)
    assert.equal((await put.json()).guest, true)
    const got = await (await s.call('GET', '/api/notes', OWNER)).json()
    assert.deepEqual(got.notes.map(n => n.id), ['a'], 'заметки владельца целы')
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

  test('не JSON — 400, чужой метод — 405', async () => {
    const raw = await fetch(s.base + '/api/notes', { method: 'PUT', headers: { Authorization: `Bearer ${OWNER}` }, body: 'не json' })
    assert.equal(raw.status, 400)
    assert.equal((await s.call('DELETE', '/api/notes', OWNER)).status, 405)
  })

  test('слишком большое тело — 413 (лимит заметок 4 МБ), заметки целы', async () => {
    const huge = body([note('big', { text: 'я'.repeat(5 * 1024 * 1024) })])
    assert.equal((await s.call('PUT', '/api/notes', OWNER, huge)).status, 413)
    assert.equal((await (await s.call('GET', '/api/notes', OWNER)).json()).notes.length, 200)
  })
})
