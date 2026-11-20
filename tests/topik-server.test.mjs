import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

// «Прогноз TOPIK I»: результаты теста слов и пробников лежат на сервере, только у владельца.
describe('API /api/topik', () => {
  let server
  before(async () => {
    server = await start()
  })
  const NOW = Date.now()
  const sample = {
    tests: [{ at: NOW, n: 40, correct: 25, wrong: 6 }],
    mocks: [{ at: NOW, l: null, r: 62, src: 'site', n: 30 }, { at: NOW, l: 55, r: 70, src: 'real', n: 0 }],
  }

  test('без токена и с чужим закрыто', async () => {
    assert.equal((await server.call('GET', '/api/topik')).status, 401)
    assert.equal((await server.call('PUT', '/api/topik', 'wrong-token-value', sample)).status, 401)
  })

  test('пустой ответ до первого сохранения; сохранённое читается обратно', async () => {
    assert.deepEqual(await (await server.call('GET', '/api/topik', OWNER)).json(), { tests: [], mocks: [] })
    const put = await server.call('PUT', '/api/topik', OWNER, sample)
    assert.equal(put.status, 200)
    assert.deepEqual(await (await server.call('GET', '/api/topik', OWNER)).json(), sample)
  })

  test('неверные данные отклоняются 400 и сохранённое не портится', async () => {
    for (const bad of [
      { tests: [{ at: NOW, n: 40, correct: 41, wrong: 0 }], mocks: [] },
      { tests: [{ at: NOW, n: 40, correct: 30, wrong: 20 }], mocks: [] },
      { tests: [], mocks: [{ at: NOW, l: 120, r: 50, src: 'real', n: 0 }] },
      { tests: [], mocks: [{ at: NOW, l: 10, r: 50, src: 'другое', n: 0 }] },
      { tests: 'x', mocks: [] },
      { tests: [] },
    ]) assert.equal((await server.call('PUT', '/api/topik', OWNER, bad)).status, 400, JSON.stringify(bad).slice(0, 60))
    assert.deepEqual(await (await server.call('GET', '/api/topik', OWNER)).json(), sample)
  })

  test('держится не больше 50 последних записей каждого вида', async () => {
    const many = { tests: Array.from({ length: 80 }, (_, i) => ({ at: NOW + i, n: 40, correct: 20, wrong: 0 })), mocks: [] }
    assert.equal((await server.call('PUT', '/api/topik', OWNER, many)).status, 200)
    const got = await (await server.call('GET', '/api/topik', OWNER)).json()
    assert.equal(got.tests.length, 50)
    assert.equal(got.tests.at(-1).at, NOW + 79)
  })
})
