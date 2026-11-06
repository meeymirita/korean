import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

describe('сервер: вход по токену живёт ограниченное время (OWNER_SESSION_HOURS)', () => {
  let s
  before(async () => {
    s = await start({ env: { OWNER_SESSION_HOURS: '4' } })
  })

  test('один токен больше не открывает кабинет: сервер просит сеанс', async () => {
    const res = await s.call('GET', '/api/progress', OWNER)
    assert.equal(res.status, 401)
    assert.equal((await res.json()).error, 'session')
  })

  test('вход по токену выдаёт сеанс, с ним доступ есть; чужой сеанс не подходит', async () => {
    const login = await s.call('POST', '/api/session', OWNER)
    assert.equal(login.status, 200)
    const { session } = await login.json()
    assert.match(session, /^[a-f0-9]{32}$/)
    assert.equal((await s.call('GET', '/api/progress', `${OWNER} ${session}`)).status, 200)
    assert.equal((await s.call('GET', '/api/progress', `${OWNER} ${'0'.repeat(32)}`)).status, 401)
  })

  test('неверный токен по-прежнему 401, гостевой токен работает без сеанса', async () => {
    assert.equal((await s.call('POST', '/api/session', 'wrong-token')).status, 401)
    const { session } = await (await s.call('POST', '/api/session', OWNER)).json()
    const g = await (await s.call('POST', '/api/guests', `${OWNER} ${session}`, { hours: 1, label: 'тест' }, { 'X-Confirm-Token': OWNER })).json()
    assert.equal((await s.call('GET', '/api/progress', g.token)).status, 200)
  })
})
