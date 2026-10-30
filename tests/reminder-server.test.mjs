import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const pad = n => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
async function mails(file, n, tries = 50) {
  for (let i = 0; i < tries; i++) {
    const t = await readFile(file, 'utf8').catch(() => '')
    const rows = t.trim() ? t.trim().split('\n').map(l => JSON.parse(l)) : []
    if (rows.length >= n) return rows
    await new Promise(r => setTimeout(r, 100))
  }
  return []
}
const env = dir => ({ BACKUP_AUTO: '0', REMINDER_TICK_MS: '100', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), REMINDER_MAIL_TO: 'me@example.org' })

describe('сервер: напоминание заниматься', () => {
  test('только владельцу; по умолчанию выключено; время проверяется', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rm-a-'))
    const s = await start({ dir, env: { ...env(dir), REMINDER_TICK_MS: '100000' } })
    assert.equal((await s.call('GET', '/api/reminder')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/reminder', g.token)).status, 403)

    const st = await (await s.call('GET', '/api/reminder', OWNER)).json()
    assert.deepEqual([st.enabled, st.time, st.mailReady], [false, '19:00', true])
    assert.ok(!JSON.stringify(st).includes('me@example.org'), 'адрес показывается скрытым')

    for (const bad of [{ time: '25:00' }, { time: '7:00' }, { time: 5 }, { enabled: 'yes' }]) assert.equal((await s.call('PUT', '/api/reminder', OWNER, bad)).status, 400, JSON.stringify(bad))
    const ok = await (await s.call('PUT', '/api/reminder', OWNER, { enabled: true, time: '08:30' })).json()
    assert.deepEqual([ok.enabled, ok.time], [true, '08:30'])
    assert.deepEqual((await (await s.call('GET', '/api/reminder', OWNER)).json()).time, '08:30')
  })

  test('занятий сегодня нет и время пришло: одно письмо, повторов в тот же день нет', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rm-b-'))
    const s = await start({ dir, env: env(dir) })
    await s.call('PUT', '/api/reminder', OWNER, { enabled: true, time: '00:00' })
    const rows = await mails(path.join(dir, 'm.jsonl'), 1)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].to, 'me@example.org')
    assert.match(rows[0].subject, /пора заниматься/)
    await new Promise(r => setTimeout(r, 600))
    assert.equal((await readFile(path.join(dir, 'm.jsonl'), 'utf8')).trim().split('\n').length, 1)
  })

  test('если сегодня уже отвечал, письма нет; выключено — тоже нет', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rm-c-'))
    const s = await start({ dir, env: env(dir) })
    await s.call('POST', '/api/ops', OWNER, { ops: [{ type: 'answer', t: Date.now(), day: today(), word: '사람', ok: true, source: 'game', mode: 'mix' }] })
    await s.call('PUT', '/api/reminder', OWNER, { enabled: true, time: '00:00' })
    assert.equal((await mails(path.join(dir, 'm.jsonl'), 1, 8)).length, 0)

    const off = await mkdtemp(path.join(tmpdir(), 'rm-d-'))
    await start({ dir: off, env: env(off) })
    assert.equal((await mails(path.join(off, 'm.jsonl'), 1, 8)).length, 0)
  })

  test('проверочное письмо по кнопке уходит сразу и без расписания', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rm-e-'))
    const s = await start({ dir, env: { ...env(dir), REMINDER_TICK_MS: '100000' } })
    assert.deepEqual(await (await s.call('POST', '/api/reminder/test', OWNER)).json(), { ok: true, message: '' })
    const rows = await mails(path.join(dir, 'm.jsonl'), 1)
    assert.equal(rows.length, 1)

    const none = await start({ env: { BACKUP_AUTO: '0', REMINDER_TICK_MS: '100000' } })
    const r = await (await none.call('POST', '/api/reminder/test', OWNER)).json()
    assert.equal(r.ok, false)
    assert.match(r.message, /некуда/)
  })
})
