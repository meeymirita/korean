import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

// Экзамены единиц книги: результаты на сервере, только владелец.
describe('API /api/exams/units', () => {
  let server
  before(async () => {
    server = await start()
  })

  test('без токена закрыто; до первой попытки пусто', async () => {
    assert.equal((await server.call('GET', '/api/exams/units')).status, 401)
    assert.equal((await server.call('POST', '/api/exams/units', 'wrong-token-value', { unit: '1A-6', right: 1, total: 2 })).status, 401)
    assert.deepEqual(await (await server.call('GET', '/api/exams/units', OWNER)).json(), { units: {} })
  })

  test('попытки копят лучший, последний и число попыток', async () => {
    await server.call('POST', '/api/exams/units', OWNER, { unit: '1A-6', right: 15, total: 20 })
    await server.call('POST', '/api/exams/units', OWNER, { unit: '1A-6', right: 19, total: 20 })
    const r = await server.call('POST', '/api/exams/units', OWNER, { unit: '1A-6', right: 10, total: 20 })
    const u = (await r.json()).units['1A-6']
    assert.deepEqual([u.best, u.last, u.tries], [95, 50, 3])
    assert.equal((await (await server.call('GET', '/api/exams/units', OWNER)).json()).units['1A-6'].best, 95)
  })

  test('неверные данные отклоняются 400', async () => {
    for (const bad of [{ unit: '3C-1', right: 1, total: 2 }, { unit: '1A-6', right: 5, total: 2 }, { unit: '1A-6', right: 1, total: 0 }, { unit: 6, right: 1, total: 2 }, {}])
      assert.equal((await server.call('POST', '/api/exams/units', OWNER, bad)).status, 400, JSON.stringify(bad))
  })
})

describe('API /api/exams/blitz', () => {
  let server
  before(async () => {
    server = await start()
  })
  const sample = { days: [{ day: '2026-11-19', right: 12, total: 20 }], weak: { eun: { ok: 2, total: 6 } } }

  test('закрыто без токена; до первого итога пусто', async () => {
    assert.equal((await server.call('GET', '/api/exams/blitz')).status, 401)
    assert.deepEqual(await (await server.call('GET', '/api/exams/blitz', OWNER)).json(), { days: [], weak: {} })
  })

  test('перенос из браузера принимается один раз, пока на сервере пусто', async () => {
    const put = await (await server.call('PUT', '/api/exams/blitz', OWNER, sample)).json()
    assert.deepEqual(put, sample)
    const again = await (await server.call('PUT', '/api/exams/blitz', OWNER, { days: [{ day: '2026-11-01', right: 1, total: 2 }], weak: {} })).json()
    assert.deepEqual(again, sample, 'второй перенос ничего не меняет')
  })

  test('итог блица: лучший за день, слабые правила копятся', async () => {
    await server.call('POST', '/api/exams/blitz', OWNER, { day: '2026-11-20', right: 10, total: 20, rules: { eun: { ok: 1, total: 4 } } })
    const r = await (await server.call('POST', '/api/exams/blitz', OWNER, { day: '2026-11-20', right: 14, total: 20, rules: {} })).json()
    assert.deepEqual(r.days.map(d => [d.day, d.right]), [['2026-11-20', 14], ['2026-11-19', 12]])
    assert.deepEqual(r.weak.eun, { ok: 3, total: 10 })
  })

  test('неверные данные отклоняются 400', async () => {
    for (const bad of [{ day: 'вчера', right: 1, total: 2 }, { day: '2026-11-20', right: 9, total: 2 }, {}])
      assert.equal((await server.call('POST', '/api/exams/blitz', OWNER, bad)).status, 400, JSON.stringify(bad))
  })
})
