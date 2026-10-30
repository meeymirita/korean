import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const caddyLog = [
  JSON.stringify({ level: 'info', ts: 1793351127.5, logger: 'http.log.access', msg: 'handled request', request: { remote_ip: '1.2.3.4', client_ip: '1.2.3.4', method: 'GET', host: 'korean.meeymirita.ru', uri: '/korean/words' }, duration: 0.012, status: 200 }),
  JSON.stringify({ level: 'error', ts: 1793351130, logger: 'http.log.access', msg: 'handled request', request: { remote_ip: '5.6.7.8', method: 'POST', host: 'korean.meeymirita.ru', uri: '/api/progress' }, duration: 0.5, status: 502 }),
  JSON.stringify({ level: 'warn', ts: 1793351131, msg: 'certificate expiring soon' }),
  'просто строка не из JSON',
].join('\n')

describe('сервер: журналы', () => {
  let s
  before(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'caddy-log-'))
    await writeFile(path.join(dir, 'access.log'), caddyLog)
    s = await start({ env: { CADDY_LOG_FILE: path.join(dir, 'access.log') } })
  })

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/logs/app')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/logs/app', g.token)).status, 403)
    assert.equal((await s.call('GET', '/api/logs/caddy', g.token)).status, 403)
  })

  test('журнал сервера: строка о запуске есть, фильтр по тексту работает', async () => {
    const all = await (await s.call('GET', '/api/logs/app', OWNER)).json()
    assert.equal(all.configured, true)
    assert.ok(all.lines.some(l => l.msg.includes('Сервер: http://127.0.0.1')), 'нет строки о запуске')
    const none = await (await s.call('GET', '/api/logs/app?q=такой-строки-нет-нигде', OWNER)).json()
    assert.deepEqual(none.lines, [])
  })

  test('журнал сервера: запросы и события попадают в него, параметры и опрос журнала нет', async () => {
    await s.call('GET', '/api/notes?q=секретное-слово', OWNER)
    await s.call('GET', '/api/notes', 'wrong-token-value')
    const r = await (await s.call('GET', '/api/logs/app', OWNER)).json()
    const text = r.lines.map(l => l.msg).join('\n')
    assert.match(text, /200 GET \/api\/notes · /)
    assert.match(text, /401 GET \/api\/notes · /)
    assert.match(text, /событие bad_token/)
    assert.ok(!text.includes('секретное-слово'), 'параметры запроса не пишутся')
    assert.ok(!text.includes('/api/logs'), 'опрос журнала не пишется')
    assert.equal(r.lines.find(l => l.msg.startsWith('401 GET'))?.level, 'warn')
  })

  test('Caddy: запросы читаются, статус задаёт уровень, не-JSON остаётся строкой', async () => {
    const r = await (await s.call('GET', '/api/logs/caddy', OWNER)).json()
    assert.equal(r.configured, true)
    assert.equal(r.lines.length, 4)
    assert.deepEqual(r.lines.map(l => l.level), ['info', 'error', 'warn', 'info'])
    assert.match(r.lines[0].msg, /^200 GET korean\.meeymirita\.ru\/korean\/words · 1\.2\.3\.4 · 12 мс$/)
    assert.equal(r.lines[3].msg, 'просто строка не из JSON')
    assert.equal(r.lines[0].t, 1793351127500)
  })

  test('Caddy: фильтры по уровню и тексту, лимит', async () => {
    assert.equal((await (await s.call('GET', '/api/logs/caddy?level=error', OWNER)).json()).lines.length, 1)
    assert.equal((await (await s.call('GET', '/api/logs/caddy?q=progress', OWNER)).json()).lines.length, 1)
    assert.equal((await (await s.call('GET', '/api/logs/caddy?limit=2', OWNER)).json()).lines.length, 2)
  })

  test('Caddy не настроен: понятный ответ вместо ошибки', async () => {
    const plain = await start()
    const r = await (await plain.call('GET', '/api/logs/caddy', OWNER)).json()
    assert.deepEqual([r.configured, r.reason, r.lines], [false, 'not set', []])
  })
})
