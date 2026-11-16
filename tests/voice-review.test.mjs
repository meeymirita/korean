import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельные OpenAI (временный ключ) и OpenRouter (разбор) на одном порту. */
function fake() {
  const seen = []
  let reply = '**Что получилось** — верно'
  const srv = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      seen.push({ url: req.url, body: JSON.parse(raw || '{}') })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (req.url?.endsWith('/chat/completions')) return res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }))
      res.end(JSON.stringify({ value: 'ek_test' }))
    })
  })
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ seen, setReply: r => (reply = r), base: `http://127.0.0.1:${srv.address().port}/v1`, close: () => srv.close() })))
}

describe('сервер: разбор голосового разговора', () => {
  let g, s
  before(async () => {
    g = await fake()
    s = await start({ env: { OPENAI_API_KEY: 'sk-test', VOICE_BASE: g.base, OPENROUTER_API_KEY: 'or-test', CHAT_BASE: g.base, CHAT_MODEL: 'review-model' } })
  })
  after(() => g.close())

  test('отчёт строится по расшифровке, хранится и отдаётся без повторного запроса к модели', async () => {
    const d = await (await s.call('POST', '/api/voice/sessions', OWNER, { scene: 'intro', ptt: true })).json()
    assert.equal(d.scene, 'intro')
    const key = g.seen.find(x => x.url.endsWith('/client_secrets'))
    assert.equal(key.body.session.audio.input.turn_detection, null, 'нажми-и-говори: автоопределение выключено')
    assert.match(key.body.session.instructions, /Сценка «Знакомство»/)

    assert.equal((await s.call('POST', `/api/voice/sessions/${d.id}/review`, OWNER, {})).status, 400, 'без реплик ученика разбирать нечего')
    for (const m of [{ role: 'assistant', text: '이름이 뭐예요?' }, { role: 'user', text: '저는 민이에요' }]) await s.call('POST', `/api/voice/sessions/${d.id}/messages`, OWNER, m)
    const r = await (await s.call('POST', `/api/voice/sessions/${d.id}/review`, OWNER, {})).json()
    assert.match(r.review, /Что получилось/)
    const asked = g.seen.filter(x => x.url.endsWith('/chat/completions'))
    assert.equal(asked.length, 1)
    assert.equal(asked[0].body.model, 'review-model')
    assert.match(asked[0].body.messages[1].content, /Ученик: 저는 민이에요/)

    g.setReply('другой')
    assert.equal((await (await s.call('POST', `/api/voice/sessions/${d.id}/review`, OWNER, {})).json()).review, r.review, 'готовый отчёт не пересоздаётся')
    assert.equal(g.seen.filter(x => x.url.endsWith('/chat/completions')).length, 1)
    assert.equal((await (await s.call('POST', `/api/voice/sessions/${d.id}/review`, OWNER, { force: true })).json()).review, 'другой')
    assert.equal((await (await s.call('GET', `/api/voice/sessions/${d.id}`, OWNER)).json()).review, 'другой')
  })

  test('без токена 401', async () => {
    assert.equal((await s.call('POST', '/api/voice/sessions/aaaaaaaaaaaaaaaa/review', null, {})).status, 401)
  })
})
