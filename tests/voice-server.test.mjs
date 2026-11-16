import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельный OpenAI: запоминает запросы на временный ключ, отвечает по сценарию. */
function fakeOpenAI() {
  const seen = []
  let mode = 'ok'
  const srv = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers['authorization'], safety: req.headers['openai-safety-identifier'], body: JSON.parse(raw || '{}') })
      if (mode === '401') return res.writeHead(401).end('{}')
      if (mode === '500') return res.writeHead(500).end('{}')
      if (mode === 'empty') return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ value: 'ek_test_secret', expires_at: 1 }))
    })
  })
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ seen, setMode: m => (mode = m), base: `http://127.0.0.1:${srv.address().port}/v1`, close: () => srv.close() })))
}

describe('сервер: голосовой собеседник', () => {
  let g, s, off
  const begin = (token = OWNER) => s.call('POST', '/api/voice/sessions', token)
  before(async () => {
    g = await fakeOpenAI()
    // лимит 1 минута в сутки: быстро проверить исчерпание
    s = await start({ env: { OPENAI_API_KEY: 'sk-test', VOICE_BASE: g.base, VOICE_MODEL: 'test-model', VOICE_DAILY_MINUTES: '1', VOICE_MAX_SESSION_MIN: '1' } })
    off = await start({ env: { OPENAI_API_KEY: '' } })
  })
  after(() => g.close())

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/voice')).status, 401)
    assert.equal((await begin(null)).status, 401)
    const t = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await begin(t.token)).status, 403)
    assert.equal((await s.call('GET', '/api/voice/sessions', t.token)).status, 403)
  })

  test('статус: ключ задан, сам ключ не отдаётся', async () => {
    const st = await (await s.call('GET', '/api/voice', OWNER)).json()
    assert.equal(st.configured, true)
    assert.equal(st.model, 'test-model')
    assert.equal(st.limitSec, 60)
    assert.equal(st.leftSec, 60)
    assert.ok(!JSON.stringify(st).includes('sk-test'))
    assert.equal((await (await off.call('GET', '/api/voice', OWNER)).json()).configured, false)
  })

  test('без ключа 503', async () => {
    assert.equal((await off.call('POST', '/api/voice/sessions', OWNER)).status, 503)
  })

  test('ошибки OpenAI: 502, пустой ключ 502, запись разговора не создаётся', async () => {
    for (const m of ['401', '500', 'empty']) {
      g.setMode(m)
      assert.equal((await begin()).status, 502, m)
    }
    g.setMode('ok')
    assert.equal((await (await s.call('GET', '/api/voice/sessions', OWNER)).json()).sessions.length, 0)
  })

  test('разговор: временный ключ, реплики, конец, расшифровка и удаление', async () => {
    const r = await begin()
    assert.equal(r.status, 200)
    const d = await r.json()
    assert.equal(d.secret, 'ek_test_secret')
    assert.equal(d.callsUrl, `${g.base}/realtime/calls`)
    assert.equal(d.maxSec, 60)
    const sent = g.seen.at(-1)
    assert.equal(sent.url, '/v1/realtime/client_secrets')
    assert.equal(sent.auth, 'Bearer sk-test', 'настоящий ключ уходит только в OpenAI')
    assert.match(sent.safety, /^[0-9a-f]{32}$/, 'безличный признак пользователя для OpenAI')
    assert.equal(sent.body.session.model, 'test-model')
    assert.match(sent.body.session.instructions, /репетитор корейского/)

    const post = (role, text) => s.call('POST', `/api/voice/sessions/${d.id}/messages`, OWNER, { role, text })
    assert.equal((await post('user', '안녕하세요')).status, 200)
    assert.equal((await post('assistant', '안녕하세요! 반가워요.')).status, 200)
    assert.equal((await post('system', 'x')).status, 400)
    assert.equal((await post('user', '   ')).status, 400)
    assert.equal((await s.call('POST', '/api/voice/sessions/nope/messages', OWNER, { role: 'user', text: 'a' })).status, 404)

    const list = await (await s.call('GET', '/api/voice/sessions', OWNER)).json()
    assert.equal(list.sessions.length, 1)
    assert.equal(list.sessions[0].messages, 2)
    assert.equal(list.sessions[0].preview, '안녕하세요')

    const end = await s.call('POST', `/api/voice/sessions/${d.id}/end`, OWNER)
    assert.equal(end.status, 200)
    const again = await s.call('POST', `/api/voice/sessions/${d.id}/end`, OWNER)
    assert.equal(again.status, 200, 'повторный конец ничего не ломает')

    const full = await (await s.call('GET', `/api/voice/sessions/${d.id}`, OWNER)).json()
    assert.deepEqual(full.messages.map(m => [m.role, m.text]), [['user', '안녕하세요'], ['assistant', '안녕하세요! 반가워요.']])

    assert.equal((await s.call('DELETE', `/api/voice/sessions/${d.id}`, OWNER)).status, 200)
    const left = await s.call('GET', `/api/voice/sessions/${d.id}`, OWNER)
    assert.equal(left.status, 200, 'за сегодня запись о минутах остаётся, текст стёрт')
    assert.equal((await left.json()).messages.length, 0)
  })
})
