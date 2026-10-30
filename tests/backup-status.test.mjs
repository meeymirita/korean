import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

describe('сервер: статус резервной копии', () => {
  test('без файла статуса: не настроено; без токена 401, гостю 403', async () => {
    const s = await start()
    assert.equal((await s.call('GET', '/api/backup/status')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/backup/status', g.token)).status, 403)
    const r = await (await s.call('GET', '/api/backup/status', OWNER)).json()
    assert.equal(r.configured, false)
    assert.equal(r.archive.job.running, false)
  })

  test('со статусом от скрипта: время, размер, отправка за пределы сервера и сообщение', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-status-'))
    await writeFile(path.join(dir, 'backup-status.json'), JSON.stringify({ ok: true, time: 1793351000000, dir: '/секретный/путь', sizeKb: 2048, offsite: true, message: 'копия готова' }))
    const s = await start({ dir })
    const r = await (await s.call('GET', '/api/backup/status', OWNER)).json()
    const { archive, ...script } = r
    assert.deepEqual(script, { configured: true, ok: true, time: 1793351000000, sizeKb: 2048, offsite: true, message: 'копия готова' })
    assert.ok(!JSON.stringify(r).includes('секретный'), 'путь на сервере наружу не отдаётся')
  })
})
