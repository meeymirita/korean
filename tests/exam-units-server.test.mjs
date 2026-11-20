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
