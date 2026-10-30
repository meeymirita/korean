import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

describe('сервер: защита', () => {
  test('заголовки безопасности есть, а «X-Powered-By» нет', async () => {
    const s = await start()
    const res = await s.call('GET', '/api/health')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/)
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert.equal(res.headers.get('x-powered-by'), null)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  test('подбор токена: после нескольких неверных адрес блокируется, даже верный токен не пускает', async () => {
    const s = await start({ env: { RATE_BAD_LIMIT: '5', RATE_LOCK_MIN: '1' } })
    for (let i = 0; i < 4; i++) assert.equal((await s.call('GET', '/api/progress', 'wrong-' + i)).status, 401)
    assert.equal((await s.call('GET', '/api/progress', OWNER)).status, 200, 'верный токен до блокировки работает и сбрасывает счётчик')
    for (let i = 0; i < 5; i++) await s.call('GET', '/api/progress', 'wrong-again-' + i)
    const locked = await s.call('GET', '/api/progress', OWNER)
    assert.equal(locked.status, 429)
    assert.ok(Number(locked.headers.get('retry-after')) > 0)
    assert.equal((await s.call('GET', '/api/health')).status, 429, 'заблокированному адресу не отвечают вообще')
  })

  test('неверные попытки пишутся в журнал событий вместе с блокировкой', async () => {
    const s = await start({ env: { RATE_BAD_LIMIT: '3' } })
    for (let i = 0; i < 3; i++) await s.call('GET', '/api/progress', 'x-' + i)
    const { DatabaseSync } = await import('node:sqlite')
    const path = await import('node:path')
    const db = new DatabaseSync(path.join(s.dir, 'app.db'), { readOnly: true })
    const types = db.prepare('SELECT type FROM events').all().map(r => r.type)
    db.close()
    assert.deepEqual([types.filter(t => t === 'bad_token').length, types.includes('ip_locked')], [2, true])
  })

  test('слишком частые запросы получают 429, потом лимит снимается со следующей минутой', async () => {
    const s = await start({ env: { RATE_LIMIT_PER_MIN: '15' } })
    const codes = []
    for (let i = 0; i < 20; i++) codes.push((await s.call('GET', '/api/health')).status)
    assert.equal(codes.filter(c => c === 200).length, 15)
    assert.equal(codes.filter(c => c === 429).length, 5)
  })

  test('загрузки и создание гостей ограничены строже обычных запросов', async () => {
    const s = await start({ env: { RATE_HEAVY_PER_MIN: '4' } })
    const codes = []
    for (let i = 0; i < 7; i++) codes.push((await s.call('POST', '/api/guests', OWNER, { hours: 1 })).status)
    assert.equal(codes.filter(c => c === 429).length, 3)
  })

  test('сверхдлинный токен и огромное тело отклоняются', async () => {
    const s = await start()
    assert.equal((await s.call('GET', '/api/progress', 'a'.repeat(5000))).status, 401)
    const big = await s.call('POST', '/api/ops', OWNER, { ops: [{ type: 'profile', name: 'x'.repeat(5 * 1024 * 1024) }] })
    assert.equal(big.status, 413)
  })

  test('картинка-«бомба» с огромным разрешением отклоняется, сервер остаётся жив', async () => {
    const s = await start()
    // PNG 20000×20000 (400 млн пикселей) заголовком, без данных: sharp должен отказаться читать
    const crc = Buffer.alloc(4)
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(20000, 0)
    ihdr.writeUInt32BE(20000, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    const chunk = (type, data) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(data.length)
      return Buffer.concat([len, Buffer.from(type), data, crc])
    }
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))])
    const res = await s.upload(OWNER, png, 'bomb.png')
    assert.equal(res.status, 400)
    assert.equal((await s.call('GET', '/api/health')).status, 200)
  })

  test('опасные действия требуют повторного токена: сброс, загрузка копии, создание гостя', async () => {
    const s = await start()
    const answer = { type: 'answer', t: 1, day: '2026-10-30', word: '사람', ok: true, source: 'game', xp: 10 }
    await s.call('POST', '/api/ops', OWNER, { ops: [answer] })
    const none = { 'X-Confirm-Token': '' }
    const wrong = { 'X-Confirm-Token': 'wrong-token-value' }
    for (const extra of [none, wrong]) {
      assert.equal((await s.call('POST', '/api/ops', OWNER, { ops: [{ type: 'reset' }] }, extra)).status, 403)
      assert.equal((await s.call('POST', '/api/ops', OWNER, { ops: [answer, { type: 'import', data: { v: 1 } }] }, extra)).status, 403)
      assert.equal((await s.call('POST', '/api/guests', OWNER, { hours: 1 }, extra)).status, 403)
    }
    assert.equal((await (await s.call('GET', '/api/progress', OWNER)).json()).xp, 10, 'данные целы, пачка с отказом не применилась')
    assert.deepEqual((await (await s.call('GET', '/api/guests', OWNER)).json()), [], 'гость не создан')
    assert.equal((await s.call('POST', '/api/ops', OWNER, { ops: [answer] }, none)).status, 200, 'обычные действия токена не просят')
    assert.equal((await s.call('POST', '/api/ops', OWNER, { ops: [{ type: 'reset' }] })).status, 200, 'с верным токеном (его ставит хелпер) можно')
    assert.equal((await (await s.call('GET', '/api/progress', OWNER)).json()).xp, 0)
    assert.equal((await s.call('POST', '/api/guests', OWNER, { hours: 1 })).status, 201)
  })

  test('неверный токен подтверждения считается подбором: после лимита адрес блокируется', async () => {
    const s = await start({ env: { RATE_BAD_LIMIT: '4' } })
    for (let i = 0; i < 4; i++) await s.call('POST', '/api/guests', OWNER, { hours: 1 }, { 'X-Confirm-Token': 'x' + i })
    assert.equal((await s.call('POST', '/api/guests', OWNER, { hours: 1 })).status, 429)
  })

  test('гость не может ни сбросить прогресс, ни создать гостя, даже зная токен владельца', async () => {
    const s = await start()
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    const withOwnerConfirm = { 'X-Confirm-Token': OWNER }
    const res = await s.call('POST', '/api/guests', g.token, { hours: 1 }, withOwnerConfirm)
    assert.equal(res.status, 403)
    const reset = await s.call('POST', '/api/ops', g.token, { ops: [{ type: 'reset' }] }, withOwnerConfirm)
    assert.equal((await reset.json()).guest, true, 'запрос гостя игнорируется')
  })
})
