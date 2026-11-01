import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельный модель: запоминает запросы, отвечает по сценарию. */
function fakeмодель() {
  const seen = []
  let mode = 'ok'
  const srv = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['authorization'], body: JSON.parse(raw || '{}') })
      if (mode === '429') return res.writeHead(429).end('{}')
      if (mode === '500') return res.writeHead(500).end('{}')
      if (mode === 'empty') return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"choices":[]}')
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: ' 빵 (пан) — хлеб ' } }] }))
    })
  })
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ seen, setMode: m => (mode = m), base: `http://127.0.0.1:${srv.address().port}/api/v1`, close: () => srv.close() })))
}

describe('сервер: помощник-чат', () => {
  let g, s, off
  const ask = (messages, token = OWNER) => s.call('POST', '/api/chat', token, { messages })
  const q = text => [{ role: 'user', text }]
  before(async () => {
    g = await fakeмодель()
    s = await start({ env: { OPENROUTER_API_KEY: 'test-key', CHAT_BASE: g.base, CHAT_MODEL: 'test-model', CHAT_DAILY_LIMIT: '4' } })
    // пустой ключ в окружении главнее server/.env: тест не должен подхватить настоящий ключ владельца
    off = await start({ env: { OPENROUTER_API_KEY: '' } })
  })
  after(() => g.close())

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/chat')).status, 401)
    assert.equal((await ask(q('привет'), null)).status, 401)
    const t = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await ask(q('привет'), t.token)).status, 403)
  })

  test('статус показывает, что ключ задан, но сам ключ не отдаёт', async () => {
    const st = await (await s.call('GET', '/api/chat', OWNER)).json()
    assert.deepEqual(st, { configured: true, model: 'test-model', limit: 4, left: 4 })
    assert.equal((await (await off.call('GET', '/api/chat', OWNER)).json()).configured, false)
  })

  test('без ключа: 503 «не настроен»', async () => {
    const r = await off.call('POST', '/api/chat', OWNER, { messages: q('привет') })
    assert.equal(r.status, 503)
  })

  test('проверка переписки: пусто, чужая роль, длинное, последнее не вопрос', async () => {
    assert.equal((await s.call('POST', '/api/chat', OWNER, {})).status, 400)
    assert.equal((await ask([])).status, 400)
    assert.equal((await ask([{ role: 'system', text: 'x' }])).status, 400)
    assert.equal((await ask(q('   '))).status, 400)
    assert.equal((await ask(q('а'.repeat(2001)))).status, 400)
    assert.equal((await ask([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }])).status, 400)
    assert.equal(g.seen.length, 0)
  })

  test('ответ: ключ уходит заголовком, инструкция и история доходят, пробелы по краям убираются', async () => {
    const r = await ask(q('Как сказать «хлеб»?'))
    assert.equal(r.status, 200)
    const j = await r.json()
    assert.equal(j.reply, '빵 (пан) — хлеб')
    assert.equal(j.left, 3)
    const got = g.seen[0]
    assert.equal(got.key, 'Bearer test-key')
    assert.equal(got.url, '/api/v1/chat/completions')
    assert.equal(got.body.model, 'test-model')
    assert.equal(got.body.messages[0].role, 'system')
    assert.match(got.body.messages[0].content, /не забегай вперёд/i)
    assert.deepEqual(got.body.messages.slice(1), [{ role: 'user', content: 'Как сказать «хлеб»?' }])
  })

  test('в модель уходят только последние 12 сообщений и начинаются с вопроса', async () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'm' + i }))
    long.push({ role: 'user', text: 'последний' })
    assert.equal((await ask(long)).status, 200)
    const c = g.seen.at(-1).body.messages.slice(1)
    assert.ok(c.length <= 12)
    assert.equal(c[0].role, 'user')
    assert.equal(c.at(-1).content, 'последний')
  })

  test('ошибки модель: 429 и 500 не списывают вопрос из суточного лимита', async () => {
    g.setMode('429')
    assert.equal((await ask(q('раз'))).status, 429)
    g.setMode('500')
    assert.equal((await ask(q('два'))).status, 502)
    g.setMode('empty')
    assert.equal((await ask(q('три'))).status, 502)
    g.setMode('ok')
    assert.equal((await ask(q('четыре'))).status, 200)
  })

  test('суточный лимит: после четырёх вопросов 429 и в модель больше не ходим', async () => {
    assert.equal((await ask(q('последний из четырёх'))).status, 200)
    const before = g.seen.length
    const r = await ask(q('сверх'))
    assert.equal(r.status, 429)
    assert.equal((await r.json()).error, 'daily limit')
    assert.equal(g.seen.length, before)
  })
})
