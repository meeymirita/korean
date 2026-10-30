import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml')])
const DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('text')])
const files = async (dir, sub) => readdir(path.join(dir, sub)).catch(() => [])

const send = (s, id, bytes, name) => {
  const form = new FormData()
  form.append('file', new Blob([bytes]), name)
  return fetch(`${s.base}/api/plans/${id}/files`, { method: 'POST', headers: { Authorization: `Bearer ${OWNER}` }, body: form })
}

describe('сервер: записи календаря и файлы', () => {
  let s, plan
  before(async () => (s = await start()))

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/plans')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/plans', g.token)).status, 403)
    assert.equal((await s.call('POST', '/api/plans', g.token, { day: '2026-11-07', title: 'x' })).status, 403)
  })

  test('создание: дата обязательна и проверяется, время необязательно, теги чистятся', async () => {
    assert.equal((await s.call('POST', '/api/plans', OWNER, { title: 'без даты' })).status, 400)
    assert.equal((await s.call('POST', '/api/plans', OWNER, { day: '2026-13-45', title: 'x' })).status, 400)
    assert.equal((await s.call('POST', '/api/plans', OWNER, { day: '2026-11-07', time: '25:00', title: 'x' })).status, 400)
    const res = await s.call('POST', '/api/plans', OWNER, { day: '2026-11-07', time: '19:30', title: ' Урок с Лерой ', text: 'домашка', tags: ['#Урок', 'лера'] })
    assert.equal(res.status, 201)
    plan = await res.json()
    assert.deepEqual([plan.day, plan.time, plan.title, plan.tags, plan.files], ['2026-11-07', '19:30', 'Урок с Лерой', ['урок', 'лера'], []])
  })

  test('файлы: PDF, docx, doc и картинка принимаются, остальное нет', async () => {
    const ids = []
    for (const [bytes, name, mime] of [[PDF, 'дз.pdf', 'application/pdf'], [DOCX, 'конспект.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], [DOC, 'старый.doc', 'application/msword'], [PNG, 'фото.png', 'image/png']]) {
      const res = await send(s, plan.id, bytes, name)
      assert.equal(res.status, 201, name)
      const f = await res.json()
      assert.equal(f.mime, mime)
      assert.equal(f.name, name)
      ids.push(f.id)
    }
    assert.equal((await send(s, plan.id, Buffer.from('MZ exe'), 'a.pdf')).status, 400)
    assert.equal((await send(s, plan.id, DOCX, 'под-видом.txt')).status, 400)
    assert.equal((await send(s, 'ffffffffffffffff', PDF, 'a.pdf')).status, 404)
    assert.equal((await files(s.dir, 'docs')).length, 4)
    assert.equal((await files(s.dir, 'thumbs')).length, 1) // миниатюра только у картинки
    const list = await (await s.call('GET', '/api/plans', OWNER)).json()
    assert.equal(list.items[0].files.length, 4)
    assert.equal(list.used, PDF.length + DOCX.length + DOC.length + PNG.length)
    plan.fileIds = ids
  })

  test('скачивание: тип верный, документы отдаются вложением, картинка и миниатюра с токеном', async () => {
    const [pdf, , , png] = plan.fileIds
    const r = await s.call('GET', `/api/plans/files/${pdf}/file`, OWNER)
    assert.equal(r.headers.get('content-type'), 'application/pdf')
    assert.match(r.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''/)
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PDF)
    assert.match((await s.call('GET', `/api/plans/files/${png}/file`, OWNER)).headers.get('content-disposition'), /^inline/)
    assert.equal((await s.call('GET', `/api/plans/files/${png}/thumb`, OWNER)).headers.get('content-type'), 'image/webp')
    assert.equal((await s.call('GET', `/api/plans/files/${pdf}/thumb`, OWNER)).status, 404)
    assert.equal((await s.call('GET', `/api/plans/files/${pdf}/file`)).status, 401)
  })

  test('правка записи и удаление файла', async () => {
    const res = await s.call('PATCH', `/api/plans/${plan.id}`, OWNER, { text: 'новое', time: '' })
    assert.equal(res.status, 200)
    const p = await res.json()
    assert.deepEqual([p.text, p.time, p.title], ['новое', '', 'Урок с Лерой'])
    assert.equal((await s.call('PATCH', `/api/plans/${plan.id}`, OWNER, {})).status, 400)
    assert.equal((await s.call('DELETE', `/api/plans/files/${plan.fileIds[0]}`, OWNER)).status, 200)
    assert.equal((await files(s.dir, 'docs')).length, 3)
  })

  test('удаление записи уносит все её файлы', async () => {
    assert.equal((await s.call('DELETE', `/api/plans/${plan.id}`, OWNER)).status, 200)
    assert.deepEqual(await files(s.dir, 'docs'), [])
    assert.deepEqual(await files(s.dir, 'thumbs'), [])
    assert.deepEqual((await (await s.call('GET', '/api/plans', OWNER)).json()).items, [])
  })

  test('место для файлов ограничено', async () => {
    const small = await start({ env: { DOCS_QUOTA_MB: '0' } })
    const p = await (await small.call('POST', '/api/plans', OWNER, { day: '2026-11-07', title: 'x' })).json()
    const form = new FormData()
    form.append('file', new Blob([PDF]), 'a.pdf')
    const res = await fetch(`${small.base}/api/plans/${p.id}/files`, { method: 'POST', headers: { Authorization: `Bearer ${OWNER}` }, body: form })
    assert.equal(res.status, 413)
  })
})
