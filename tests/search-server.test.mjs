import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

describe('API поиска Meilisearch', () => {
  let server

  before(async () => {
    server = await start({ env: { MEILISEARCH_URL: '', MEILISEARCH_MASTER_KEY: '' } })
  })

  test('публичный поиск сообщает о ненастроенном индексе, владелец видит закрытый статус', async () => {
    const search = await server.call('GET', '/api/search?q=학교')
    assert.equal(search.status, 503)
    assert.equal((await search.json()).error, 'поиск не настроен')

    assert.equal((await server.call('GET', '/api/search/status')).status, 401)
    const status = await server.call('GET', '/api/search/status', OWNER)
    assert.equal(status.status, 200)
    assert.equal((await status.json()).configured, false)
  })

  test('переиндексация отклоняет приватные категории до сетевого обращения', async () => {
    const response = await server.call('POST', '/api/search/reindex', OWNER, [{ id: 'note:1', category: 'note', title: 'личное', text: 'заметка' }])
    assert.equal(response.status, 400)
  })

  test('закрытый поиск требует владельца и принимает только заметки или изображения', async () => {
    assert.equal((await server.call('GET', '/api/search/private?q=план&category=note')).status, 401)
    const invalid = await server.call('GET', '/api/search/private?q=план&category=event', OWNER)
    assert.equal(invalid.status, 400)
  })
})
