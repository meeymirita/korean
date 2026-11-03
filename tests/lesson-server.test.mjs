import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

async function mails(file, n, tries = 50) {
  for (let i = 0; i < tries; i++) {
    const t = await readFile(file, 'utf8').catch(() => '')
    const rows = t.trim() ? t.trim().split('\n').map(l => JSON.parse(l)) : []
    if (rows.length >= n) return rows
    await new Promise(r => setTimeout(r, 100))
  }
  return []
}
const env = dir => ({ BACKUP_AUTO: '0', LESSON_TICK_MS: '100', MAIL_DUMP_FILE: path.join(dir, 'm.jsonl'), REMINDER_MAIL_TO: 'me@example.org' })
const today = new Date().getDay()
const otherDay = (today + 3) % 7

describe('сервер: напоминание о созвоне', () => {
  test('только владельцу; по умолчанию выключено, суббота, 19:30', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ls-a-'))
    const s = await start({ dir, env: { ...env(dir), LESSON_TICK_MS: '100000' } })
    assert.equal((await s.call('GET', '/api/lesson')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/lesson', g.token)).status, 403)

    const st = await (await s.call('GET', '/api/lesson', OWNER)).json()
    assert.deepEqual([st.enabled, st.weekday, st.time, st.mailReady], [false, 6, '19:30', true])

    for (const bad of [{ time: '25:00' }, { weekday: 7 }, { weekday: -1 }, { weekday: 'sat' }, { enabled: 'yes' }])
      assert.equal((await s.call('PUT', '/api/lesson', OWNER, bad)).status, 400, JSON.stringify(bad))
    const ok = await (await s.call('PUT', '/api/lesson', OWNER, { enabled: true, weekday: 3, time: '08:30' })).json()
    assert.deepEqual([ok.enabled, ok.weekday, ok.time], [true, 3, '08:30'])
  })

  test('сегодняшний день недели и время пришло: одно письмо, повторов нет', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ls-b-'))
    const s = await start({ dir, env: env(dir) })
    await s.call('PUT', '/api/lesson', OWNER, { enabled: true, weekday: today, time: '00:00' })
    const rows = await mails(path.join(dir, 'm.jsonl'), 1)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].to, 'me@example.org')
    assert.match(rows[0].subject, /созвон/)
    await new Promise(r => setTimeout(r, 600))
    assert.equal((await readFile(path.join(dir, 'm.jsonl'), 'utf8')).trim().split('\n').length, 1)
  })

  test('не тот день недели — письма нет, даже если время пришло', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ls-c-'))
    const s = await start({ dir, env: env(dir) })
    await s.call('PUT', '/api/lesson', OWNER, { enabled: true, weekday: otherDay, time: '00:00' })
    assert.equal((await mails(path.join(dir, 'm.jsonl'), 1, 8)).length, 0)
  })

  test('проверочное письмо по кнопке уходит сразу, без дня и расписания', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ls-d-'))
    const s = await start({ dir, env: { ...env(dir), LESSON_TICK_MS: '100000' } })
    assert.deepEqual(await (await s.call('POST', '/api/lesson/test', OWNER)).json(), { ok: true, message: '' })
    const rows = await mails(path.join(dir, 'm.jsonl'), 1)
    assert.equal(rows.length, 1)
  })
})
