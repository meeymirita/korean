import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const server = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rm-api-'))
  return start({ dir, env: { BACKUP_AUTO: '0', REMINDER_TICK_MS: '100000', REMINDER_MAIL_TO: 'me@example.org', MAIL_DUMP_FILE: path.join(dir, 'mail.jsonl') } })
}

describe('сервер: напоминание заниматься', () => {
  test('только владельцу; по умолчанию выключено; время и дни проверяются', async () => {
    const s = await server()
    assert.equal((await s.call('GET', '/api/reminder')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/reminder', g.token)).status, 403)

    const st = await (await s.call('GET', '/api/reminder', OWNER)).json()
    assert.deepEqual([st.enabled, st.time, st.mailReady], [false, '19:00', true])
    assert.ok(!JSON.stringify(st).includes('me@example.org'), 'адрес показывается скрытым')

    for (const bad of [{ time: '25:00' }, { time: '7:00' }, { time: 5 }, { enabled: 'yes' }, { days: [7] }, { days: [-1] }, { days: 'sat' }, { days: [1, 'tue'] }])
      assert.equal((await s.call('PUT', '/api/reminder', OWNER, bad)).status, 400, JSON.stringify(bad))
    const ok = await (await s.call('PUT', '/api/reminder', OWNER, { enabled: true, time: '08:30', days: [1, 3, 1] })).json()
    assert.deepEqual([ok.enabled, ok.time, ok.days], [true, '08:30', [1, 3]])
    assert.deepEqual((await (await s.call('GET', '/api/reminder', OWNER)).json()).time, '08:30')
  })

  test('проверочное письмо отправляется сразу без ожидания таймера', async () => {
    const s = await server()
    assert.deepEqual(await (await s.call('POST', '/api/reminder/test', OWNER)).json(), { ok: true, message: '' })
    const none = await start({ env: { BACKUP_AUTO: '0', REMINDER_TICK_MS: '100000' } })
    const r = await (await none.call('POST', '/api/reminder/test', OWNER)).json()
    assert.equal(r.ok, false)
    assert.match(r.message, /некуда/)
  })

  test('пустой список дней сохраняет режим «каждый день»', async () => {
    const s = await server()
    const set = await (await s.call('PUT', '/api/reminder', OWNER, { enabled: true, time: '00:00', days: [] })).json()
    assert.deepEqual(set.days, [])
  })
})
