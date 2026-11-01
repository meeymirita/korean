import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

const stroke = { c: '#3b3a5a', w: 4, p: [[1, 2, 0.5], [3, 4, 0.5]] }

describe('сервер: «Тетрадь»', () => {
  let s
  before(async () => (s = await start()))
  const post = (body, token = OWNER) => s.call('POST', '/api/notebook', token, body)
  const patch = (id, body) => s.call('PATCH', `/api/notebook/${id}`, OWNER, body)
  const list = async () => (await (await s.call('GET', '/api/notebook', OWNER)).json()).items

  test('без токена 401, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/notebook')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/notebook', g.token)).status, 403)
    assert.equal((await post({ kind: 'folder', name: 'x' }, g.token)).status, 403)
  })

  test('папки и листы: создание, проверка полей, вложенность', async () => {
    assert.equal((await post({ kind: 'файл' })).status, 400)
    assert.equal((await post({ kind: 'folder', name: '   ' })).status, 400)
    assert.equal((await post({ kind: 'sheet', name: 'x', tpl: 'нет' })).status, 400)
    assert.equal((await post({ kind: 'sheet', name: 'x', parent: 'abcdefabcdefabcd' })).status, 400)
    const a = await (await post({ kind: 'folder', name: ' Хангыль ' })).json()
    assert.equal(a.name, 'Хангыль')
    const b = await (await post({ kind: 'folder', name: 'Гласные', parent: a.id })).json()
    const sh = await (await post({ kind: 'sheet', name: 'ㅏ', parent: b.id, tpl: 'hangul' })).json()
    assert.deepEqual([sh.parent, sh.tpl, sh.strokes, sh.text], [b.id, 'hangul', [], ''])
    assert.equal((await post({ kind: 'sheet', name: 'в листе', parent: sh.id })).status, 400)
    assert.equal((await list()).length, 3)
  })

  test('лист: штрихи и текст сохраняются и читаются целиком, в списке их нет', async () => {
    const sh = await (await post({ kind: 'sheet', name: 'рисунок' })).json()
    assert.equal((await patch(sh.id, { strokes: 'нет' })).status, 400)
    assert.equal((await patch(sh.id, { strokes: [{ c: 'red', w: 4, p: [] }] })).status, 400)
    assert.equal((await patch(sh.id, { strokes: [{ c: '#fff', w: 4, p: [[1, 2]] }] })).status, 400)
    assert.equal((await patch(sh.id, { strokes: [stroke], text: 'привет', tpl: 'grid' })).status, 200)
    const full = await (await s.call('GET', `/api/notebook/${sh.id}`, OWNER)).json()
    assert.deepEqual([full.strokes, full.text, full.tpl], [[stroke], 'привет', 'grid'])
    assert.equal((await list()).find(i => i.id === sh.id).strokes, undefined)
  })

  test('избранное: отметка включается, выключается и видна в списке', async () => {
    const sh = await (await post({ kind: 'sheet', name: 'fav' })).json()
    assert.equal(sh.fav, 0)
    assert.equal((await patch(sh.id, { fav: 'да' })).status, 400)
    assert.equal((await patch(sh.id, { fav: true })).status, 200)
    assert.equal((await list()).find(i => i.id === sh.id).fav, 1)
    await patch(sh.id, { fav: false })
    assert.equal((await list()).find(i => i.id === sh.id).fav, 0)
  })

  test('перенос: в папку, в корень; папку в саму себя и в потомка нельзя', async () => {
    const a = await (await post({ kind: 'folder', name: 'A' })).json()
    const b = await (await post({ kind: 'folder', name: 'B', parent: a.id })).json()
    const sh = await (await post({ kind: 'sheet', name: 'L' })).json()
    assert.equal((await patch(sh.id, { parent: b.id })).status, 200)
    assert.equal((await patch(sh.id, { parent: null })).status, 200)
    assert.equal((await patch(a.id, { parent: a.id })).status, 400)
    assert.equal((await patch(a.id, { parent: b.id })).status, 400)
    assert.equal((await patch(a.id, { strokes: [] })).status, 400)
  })

  test('удаление папки уносит всё внутри; неизвестный id — 404', async () => {
    const a = await (await post({ kind: 'folder', name: 'Del' })).json()
    const b = await (await post({ kind: 'folder', name: 'Del2', parent: a.id })).json()
    const sh = await (await post({ kind: 'sheet', name: 'Del3', parent: b.id })).json()
    assert.equal((await s.call('DELETE', `/api/notebook/${a.id}`, OWNER)).status, 200)
    const ids = (await list()).map(i => i.id)
    assert.ok(![a.id, b.id, sh.id].some(id => ids.includes(id)))
    assert.equal((await s.call('DELETE', `/api/notebook/${a.id}`, OWNER)).status, 404)
    assert.equal((await s.call('GET', '/api/notebook/zzz', OWNER)).status, 404)
  })
})
