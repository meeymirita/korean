import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельная модель: на каждый вопрос отвечает «ответ N». */
function fakeModel() {
  let n = 0
  const srv = http.createServer((req, res) => {
    req.on('data', () => {})
    req.on('end', () => {
      n++
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: `ответ ${n}` } }] }))
    })
  })
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${srv.address().port}/api/v1`, close: () => srv.close() })))
}

describe('сервер: история чатов помощника', () => {
  let g, s
  const ask = (messages, conv) => s.call('POST', '/api/chat', OWNER, conv === undefined ? { messages } : { messages, conv })
  const u = text => ({ role: 'user', text })
  before(async () => {
    g = await fakeModel()
    s = await start({ env: { OPENROUTER_API_KEY: 'test-key', CHAT_BASE: g.base, CHAT_MODEL: 'm', CHAT_DAILY_LIMIT: '50' } })
  })
  after(() => g.close())

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/chat/conversations')).status, 401)
    const t = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/chat/conversations', t.token)).status, 403)
    assert.equal((await s.call('DELETE', '/api/chat/conversations/aaaaaaaaaaaaaaaa', t.token)).status, 403)
  })

  test('без поля conv ничего не сохраняется (прежнее поведение)', async () => {
    const r = await ask([u('привет')])
    assert.equal(r.status, 200)
    assert.equal('conv' in (await r.json()), false)
    assert.deepEqual((await (await s.call('GET', '/api/chat/conversations', OWNER)).json()).conversations, [])
  })

  test('conv=new заводит чат, дальше вопросы дописываются в него', async () => {
    const a = await (await ask([u('Как сказать «хлеб»?')], 'new')).json()
    assert.match(a.conv, /^[0-9a-f]{16}$/)
    const b = await (await ask([u('Как сказать «хлеб»?'), { role: 'assistant', text: a.reply }, u('А «вода»?')], a.conv)).json()
    assert.equal(b.conv, a.conv)
    const list = (await (await s.call('GET', '/api/chat/conversations', OWNER)).json()).conversations
    assert.equal(list.length, 1)
    assert.equal(list[0].id, a.conv)
    assert.equal(list[0].title, 'Как сказать «хлеб»?')
    assert.equal(list[0].messages, 4)
    const one = await (await s.call('GET', `/api/chat/conversations/${a.conv}`, OWNER)).json()
    assert.deepEqual(one.messages.map(m => [m.role, m.text]), [['user', 'Как сказать «хлеб»?'], ['assistant', a.reply], ['user', 'А «вода»?'], ['assistant', b.reply]])
  })

  test('второй чат идёт сверху, удаление стирает чат и сообщения', async () => {
    const c = await (await ask([u('второй чат')], 'new')).json()
    let list = (await (await s.call('GET', '/api/chat/conversations', OWNER)).json()).conversations
    assert.equal(list.length, 2)
    assert.equal(list[0].id, c.conv)
    assert.equal((await s.call('DELETE', `/api/chat/conversations/${c.conv}`, OWNER)).status, 200)
    assert.equal((await s.call('GET', `/api/chat/conversations/${c.conv}`, OWNER)).status, 404)
    assert.equal((await s.call('DELETE', `/api/chat/conversations/${c.conv}`, OWNER)).status, 404)
    list = (await (await s.call('GET', '/api/chat/conversations', OWNER)).json()).conversations
    assert.equal(list.length, 1)
  })

  test('чужой номер чата: 404, вопрос не тратится; неверный номер: 400', async () => {
    const before = (await (await s.call('GET', '/api/chat', OWNER)).json()).left
    assert.equal((await ask([u('привет')], 'aaaaaaaaaaaaaaaa')).status, 404)
    assert.equal((await ask([u('привет')], 'не номер')).status, 400)
    assert.equal((await (await s.call('GET', '/api/chat', OWNER)).json()).left, before)
  })
})
