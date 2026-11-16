import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

/** Поддельные Groq и Gemini на одном порту: поставщика узнаём по ключу в заголовке; Groq можно «довести до лимита». */
function fake() {
  const seen = []
  let groqLimit = false
  const srv = http.createServer((req, res) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const who = (req.headers.authorization || '').includes('gk') ? 'groq' : 'gemini'
      const raw = Buffer.concat(chunks)
      const isJson = (req.headers['content-type'] || '').includes('json')
      seen.push({ url: req.url, who, body: isJson ? JSON.parse(raw.toString() || '{}') : null, size: raw.length })
      const json = (code, o) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(o))
      if (req.url.includes(':generateContent')) return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(480, 1).toString('base64') } }] } }] })
      if (req.url.endsWith('/audio/transcriptions')) return json(200, { text: ' 안녕하세요  ' })
      if (who === 'groq' && groqLimit) return json(429, {})
      const sys = seen.at(-1).body?.messages?.[0]?.content ?? ''
      const text = /проверяешь ответ репетитора/.test(sys) ? `Проверка: верно (${who})` : `Ответ ${who}`
      json(200, { choices: [{ message: { content: text } }] })
    })
  })
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({ seen, setGroqLimit: v => (groqLimit = v), base: `http://127.0.0.1:${srv.address().port}/v1`, close: () => srv.close() })))
}

describe('сервер: бесплатные модели голосового окна', () => {
  let g, s, none
  const ask = (b, t = OWNER) => s.call('POST', '/api/voice/ask', t, b)
  const msgs = [{ role: 'user', text: 'Как сказать я студент?' }]
  before(async () => {
    g = await fake()
    s = await start({ env: { GROQ_API_KEY: 'gk', GROQ_BASE: g.base, GEMINI_API_KEY: 'mk', GEMINI_BASE: g.base, GEMINI_NATIVE_BASE: g.base, GEMINI_TTS_MODEL: 'tts-test', GEMINI_MODEL: 'g-test', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '' } })
    none = await start({ env: { GROQ_API_KEY: '', GEMINI_API_KEY: '', OPENROUTER_API_KEY: '', OPENAI_API_KEY: '' } })
  })
  after(() => g.close())

  test('без токена 401, неверные реплики 400, без ключей 503', async () => {
    assert.equal((await ask({ messages: msgs }, null)).status, 401)
    assert.equal((await ask({ messages: [] })).status, 400)
    assert.equal((await none.call('POST', '/api/voice/ask', OWNER, { messages: msgs })).status, 503)
  })

  test('статус: подключённые поставщики и Whisper, сами ключи не отдаются', async () => {
    const st = await (await s.call('GET', '/api/voice', OWNER)).json()
    assert.deepEqual(st.providers.map(p => p.id), ['groq', 'gemini'])
    assert.equal(st.whisper, true)
    assert.ok(!JSON.stringify(st).includes('gk') || !JSON.stringify(st).includes('"gk"'))
    const st2 = await (await none.call('GET', '/api/voice', OWNER)).json()
    assert.deepEqual(st2.providers, [])
    assert.equal(st2.whisper, false)
  })

  test('выбранная модель отвечает первой, без проверки проверки нет', async () => {
    const r = await (await ask({ messages: msgs, provider: 'gemini' })).json()
    assert.equal(r.provider, 'Gemini')
    assert.equal(r.text, 'Ответ gemini')
    assert.equal(r.check, null)
    assert.equal(g.seen.at(-1).body.model, 'g-test')
  })

  test('перекрёстная проверка берёт другую модель, «сама себя» ту же', async () => {
    const c = await (await ask({ messages: msgs, provider: 'groq', check: 'cross' })).json()
    assert.equal(c.provider, 'Groq')
    assert.match(c.check.text, /gemini/)
    assert.equal(c.check.provider, 'Gemini')
    const self = await (await ask({ messages: msgs, provider: 'groq', check: 'self' })).json()
    assert.equal(self.check.provider, 'Groq')
  })

  test('лимит выбранной модели: отвечает запасная', async () => {
    g.setGroqLimit(true)
    const r = await (await ask({ messages: msgs, provider: 'groq' })).json()
    assert.equal(r.provider, 'Gemini')
    g.setGroqLimit(false)
  })

  test('Whisper: запись уходит в Groq, текст возвращается чистым', async () => {
    const audio = Buffer.from('fake-audio-bytes').toString('base64')
    const r = await (await s.call('POST', '/api/voice/transcribe', OWNER, { audio, mime: 'audio/webm;codecs=opus' })).json()
    assert.equal(r.text, '안녕하세요')
    assert.ok(g.seen.some(x => x.url.endsWith('/audio/transcriptions') && x.size > 0))
    assert.equal((await s.call('POST', '/api/voice/transcribe', OWNER, {})).status, 400)
  })

  test('озвучка: звук приходит готовым WAV, голос из списка, повтор берётся из кэша', async () => {
    const st = await (await s.call('GET', '/api/voice', OWNER)).json()
    assert.equal(st.tts, true)
    assert.ok(st.ttsVoices.includes('Kore'))
    const n = () => g.seen.filter(x => x.url.includes(':generateContent')).length
    const r = await (await s.call('POST', '/api/voice/speak', OWNER, { text: '**책이** 책상 위에 있어요. Книга на столе.', voice: 'Puck' })).json()
    assert.equal(r.mime, 'audio/wav')
    assert.equal(Buffer.from(r.audio, 'base64').subarray(0, 4).toString(), 'RIFF')
    assert.equal(r.cached, false)
    const sent = g.seen.find(x => x.url.includes(':generateContent'))
    assert.match(sent.url, /models\/tts-test:generateContent/)
    assert.equal(sent.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Puck')
    assert.ok(!sent.body.contents[0].parts[0].text.includes('*'), 'разметка убрана')
    const before = n()
    const again = await (await s.call('POST', '/api/voice/speak', OWNER, { text: '**책이** 책상 위에 있어요. Книга на столе.', voice: 'Puck' })).json()
    assert.equal(again.cached, true)
    assert.equal(n(), before, 'повтор не идёт в Gemini')
    await s.call('POST', '/api/voice/speak', OWNER, { text: 'Привет', voice: 'нет такого' })
    assert.equal(g.seen.filter(x => x.url.includes(':generateContent')).at(-1).body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore')
    assert.equal((await s.call('POST', '/api/voice/speak', OWNER, { text: '  ' })).status, 400)
    assert.equal((await s.call('POST', '/api/voice/speak', null, { text: 'a' })).status, 401)
    assert.equal((await none.call('POST', '/api/voice/speak', OWNER, { text: 'a' })).status, 503)
  })

  test('бесплатный разговор не тратит минуты OpenAI, реплики сохраняются', async () => {
    const before = await (await s.call('GET', '/api/voice', OWNER)).json()
    const d = await (await s.call('POST', '/api/voice/sessions', OWNER, { free: true, scene: 'intro' })).json()
    assert.equal(d.free, true)
    await s.call('POST', `/api/voice/sessions/${d.id}/messages`, OWNER, { role: 'user', text: '안녕하세요' })
    await s.call('POST', `/api/voice/sessions/${d.id}/end`, OWNER)
    const after = await (await s.call('GET', '/api/voice', OWNER)).json()
    assert.equal(after.usedSec, before.usedSec)
    assert.equal((await (await s.call('GET', `/api/voice/sessions/${d.id}`, OWNER)).json()).messages.length, 1)
    assert.equal((await none.call('POST', '/api/voice/sessions', OWNER, { free: true })).status, 503)
  })

  test('разбор разговора выбранной моделью', async () => {
    const d = await (await s.call('POST', '/api/voice/sessions', OWNER, { free: true })).json()
    await s.call('POST', `/api/voice/sessions/${d.id}/messages`, OWNER, { role: 'user', text: '저는 학생이에요' })
    const r = await (await s.call('POST', `/api/voice/sessions/${d.id}/review`, OWNER, { provider: 'gemini' })).json()
    assert.equal(r.review, 'Ответ gemini')
  })
})
