import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const note = (id, extra = {}) => ({ id, title: 'Название', text: 'Описание', created: 1, updated: 2, ...extra })
const body = (notes, updated = 10) => ({ v: 1, updated, notes })

describe('сервер: закрепление, корзина и напоминание заметок', () => {
  let s
  before(async () => (s = await start()))
  const live = async () => (await (await s.call('GET', '/api/notes', OWNER)).json()).notes
  const trash = async () => (await (await s.call('GET', '/api/notes/trash', OWNER)).json())

  test('закреплённые идут первыми, внутри групп новые сверху', async () => {
    await s.call('PUT', '/api/notes', OWNER, body([note('a', { created: 1 }), note('b', { created: 5 }), note('c', { created: 3, pinned: true }), note('d', { created: 2, pinned: true })]))
    const got = await live()
    assert.deepEqual(got.map(n => n.id), ['c', 'd', 'b', 'a'])
    assert.deepEqual(got.map(n => n.pinned), [true, true, false, false])
    assert.equal((await s.call('PUT', '/api/notes', OWNER, body([note('a', { pinned: 'да' })]))).status, 400)
  })

  test('ручной порядок (pos) сохраняется и отдаётся; неверный pos отклоняется', async () => {
    await s.call('PUT', '/api/notes', OWNER, body([note('a', { pos: 2 }), note('b', { pos: 0 }), note('c', { pos: null })], 9))
    const got = await live()
    assert.deepEqual(Object.fromEntries(got.map(x => [x.id, x.pos])), { a: 2, b: 0, c: null })
    for (const bad of [-1, 1.5, 'x', 200000]) assert.equal((await s.call('PUT', '/api/notes', OWNER, body([note('a', { pos: bad })]))).status, 400, String(bad))
  })

  test('убранная из списка заметка уходит в корзину, а не стирается', async () => {
    await s.call('PUT', '/api/notes', OWNER, body([note('a'), note('b', { created: 5 }), note('c', { pinned: true })], 11))
    assert.deepEqual((await live()).map(n => n.id), ['c', 'b', 'a'])
    const t = await trash()
    assert.equal(t.days, 30)
    assert.deepEqual(t.items.map(n => n.id), ['d'])
    assert.equal(typeof t.items[0].deletedAt, 'number')
  })

  test('восстановление, лимит не нарушен; чужой id и живая заметка — 404', async () => {
    const r = await s.call('POST', '/api/notes/d/restore', OWNER)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).note.id, 'd')
    assert.ok((await live()).some(n => n.id === 'd'))
    assert.equal((await s.call('POST', '/api/notes/d/restore', OWNER)).status, 404)
    assert.equal((await s.call('POST', '/api/notes/нет/restore', OWNER)).status, 404)
  })

  test('окончательное удаление просит повторный токен', async () => {
    await s.call('PUT', '/api/notes', OWNER, body([note('a'), note('b'), note('c', { pinned: true })], 12)) // d снова в корзине
    assert.equal((await s.call('DELETE', '/api/notes/d', OWNER, undefined, { 'X-Confirm-Token': 'wrong' })).status, 403)
    assert.equal((await trash()).items.length, 1)
    assert.equal((await s.call('DELETE', '/api/notes/a', OWNER)).status, 404, 'живую заметку так не удалить')
    assert.equal((await s.call('DELETE', '/api/notes/d', OWNER)).status, 200)
    assert.equal((await trash()).items.length, 0)
  })

  test('напоминание: формат и сохранение при следующей записи списка', async () => {
    const at = '2031-05-04T09:30'
    await s.call('PUT', '/api/notes', OWNER, body([note('a', { remindAt: at })], 13))
    assert.equal((await live())[0].remindAt, at)
    await s.call('PUT', '/api/notes', OWNER, body([note('a', { remindAt: at, title: 'Новое' })], 14))
    assert.equal((await live())[0].remindAt, at)
    await s.call('PUT', '/api/notes', OWNER, body([note('a')], 15))
    assert.equal((await live())[0].remindAt, null)
    for (const bad of ['завтра', '2031-13-01T10:00', '2031-05-04 09:30', 5]) {
      assert.equal((await s.call('PUT', '/api/notes', OWNER, body([note('a', { remindAt: bad })], 16))).status, 400, String(bad))
    }
  })

  test('гостю корзина закрыта (403), его записи не сохраняются', async () => {
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/notes/trash', g.token)).status, 403)
    assert.equal((await s.call('POST', '/api/notes/a/restore', g.token)).status, 403)
    assert.equal((await s.call('GET', '/api/images/trash', g.token)).status, 403)
    assert.equal((await (await s.call('PUT', '/api/notes', g.token, body([note('g', { pinned: true })]))).json()).guest, true)
    assert.ok(!(await live()).some(n => n.id === 'g'))
  })
})
