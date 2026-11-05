import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

describe('API состояния инфраструктуры', () => {
  let server

  before(async () => {
    server = await start({ env: { DOCKER_API_URL: '' } })
  })

  test('статусы и журналы доступны только владельцу', async () => {
    assert.equal((await server.call('GET', '/api/ops/services')).status, 401)
    assert.equal((await server.call('GET', '/api/ops/logs/backend')).status, 401)
    assert.equal((await server.call('GET', '/api/ops/services', 'неверный-токен')).status, 401)
    const status = await server.call('GET', '/api/ops/services', OWNER)
    assert.equal(status.status, 503, 'владелец прошёл защиту, но Docker proxy намеренно не настроен')
    assert.deepEqual(await status.json(), { error: 'docker_api_not_configured' })
  })
})
