import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const data = { words: [{ k: '책', r: 'чхэк', t: 'книга' }], rule: { id: 'eun', ko: '은 / 는', ru: 'тема' }, ruleTasks: [], tasks: [{ title: 'Что значит слово?', prompt: '책', options: ['книга', 'вода'], answer: 'книга', picked: 'книга', kind: 'tr' }], check: null }

describe('сервер: сохранённые наборы «Сегодня»', () => {
  let s, id
  before(async () => (s = await start()))

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/sets')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/sets', g.token)).status, 403)
    assert.equal((await s.call('POST', '/api/sets', g.token, { day: '2026-11-07', right: 1, total: 1, data })).status, 403)
  })

  test('сохранение и список: новые сверху, снимок возвращается целиком', async () => {
    const a = await s.call('POST', '/api/sets', OWNER, { day: '2026-11-06', right: 1, total: 2, data })
    assert.equal(a.status, 201)
    await new Promise(r => setTimeout(r, 5))
    const b = await (await s.call('POST', '/api/sets', OWNER, { day: '2026-11-07', right: 2, total: 2, data })).json()
    id = b.id
    const list = await (await s.call('GET', '/api/sets', OWNER)).json()
    assert.deepEqual(list.items.map(x => [x.day, x.right, x.total]), [['2026-11-07', 2, 2], ['2026-11-06', 1, 2]])
    assert.deepEqual(list.items[0].data, data)
  })

  test('неверные данные — 400', async () => {
    for (const body of [{}, { day: 'вчера', right: 1, total: 1, data }, { day: '2026-11-07', right: 3, total: 2, data }, { day: '2026-11-07', right: 1, total: 1 }, { day: '2026-11-07', right: 1, total: 1, data: [] }, { day: '2026-11-07', right: 1, total: 1, data: { x: 'я'.repeat(250_000) } }]) {
      assert.equal((await s.call('POST', '/api/sets', OWNER, body)).status, 400, JSON.stringify(body).slice(0, 60))
    }
  })

  test('удаление; повторное — 404', async () => {
    assert.equal((await s.call('DELETE', `/api/sets/${id}`, OWNER)).status, 200)
    assert.equal((await s.call('DELETE', `/api/sets/${id}`, OWNER)).status, 404)
    assert.equal((await (await s.call('GET', '/api/sets', OWNER)).json()).items.length, 1)
  })
})
