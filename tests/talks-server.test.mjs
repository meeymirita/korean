import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельная модель чата и поддельный OpenAI для голоса в одном маленьком сервере. */
function fakeServices() {
  const srv = http.createServer((req, res) => {
    req.on('data', () => {})
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (req.url.includes('chat/completions')) res.end(JSON.stringify({ choices: [{ message: { content: '빵 — это хлеб, ответ помощника' } }] }))
      else res.end(JSON.stringify({ value: 'ek_test_secret', expires_at: 1 }))
    })
  })
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })))
}

describe('сервер: общая история разговоров', () => {
  let g, s
  const talks = async (q = '') => (await (await s.call('GET', `/api/talks${q ? '?q=' + encodeURIComponent(q) : ''}`, OWNER)).json()).talks
  before(async () => {
    g = await fakeServices()
    s = await start({ env: { OPENROUTER_API_KEY: 'k', CHAT_BASE: `${g.base}/api/v1`, CHAT_MODEL: 'm', CHAT_DAILY_LIMIT: '50', OPENAI_API_KEY: 'sk', VOICE_BASE: `${g.base}/v1`, VOICE_MODEL: 'm' } })
    // чат с помощником
    const c = await (await s.call('POST', '/api/chat', OWNER, { messages: [{ role: 'user', text: 'Как сказать «хлеб»?' }], conv: 'new' })).json()
    assert.ok(c.conv)
    // голосовой разговор с двумя репликами
    const v = await (await s.call('POST', '/api/voice/sessions', OWNER, {})).json()
    assert.ok(v.id)
    await s.call('POST', `/api/voice/sessions/${v.id}/messages`, OWNER, { role: 'user', text: 'Расскажи про будущее время' })
    await s.call('POST', `/api/voice/sessions/${v.id}/messages`, OWNER, { role: 'assistant', text: 'Будущее время образуется так' })
    // голосовой разговор без реплик не должен попасть в список
    await s.call('POST', '/api/voice/sessions', OWNER, {})
  })
  after(() => g.close())

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/talks')).status, 401)
    const t = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/talks', t.token)).status, 403)
  })

  test('в списке и чат, и голосовой разговор; пустой разговор голоса пропущен', async () => {
    const list = await talks()
    assert.deepEqual(list.map(t => t.kind).sort(), ['chat', 'voice'])
    const chat = list.find(t => t.kind === 'chat')
    const voice = list.find(t => t.kind === 'voice')
    assert.equal(chat.title, 'Как сказать «хлеб»?')
    assert.equal(chat.messages, 2)
    assert.equal(voice.title, 'Расскажи про будущее время')
    assert.equal(voice.messages, 2)
  })

  test('поиск находит чат по тексту ответа и вопроса, регистр не важен, есть кусок текста', async () => {
    const byAnswer = await talks('ХЛЕБ')
    assert.equal(byAnswer.length, 1)
    assert.equal(byAnswer[0].kind, 'chat')
    assert.ok(byAnswer[0].snippet.toLowerCase().includes('хлеб'))
    assert.ok(byAnswer[0].matches >= 1)
  })

  test('поиск находит голосовой разговор по реплике', async () => {
    const r = await talks('образуется')
    assert.equal(r.length, 1)
    assert.equal(r[0].kind, 'voice')
    assert.match(r[0].snippet, /образуется/)
  })

  test('поиск по слову из обоих: оба вида в одном списке; ничего не нашлось: пусто; один знак: весь список', async () => {
    assert.deepEqual((await talks('время')).map(t => t.kind), ['voice'])
    assert.deepEqual(await talks('такого нигде нет'), [])
    assert.equal((await talks('х')).length, 2)
  })
})
