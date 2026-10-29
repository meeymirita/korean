import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { OWNER, cleanup, start } from './_server.mjs'

after(cleanup)

describe('сервер: просмотр базы', () => {
  let s
  before(async () => {
    s = await start()
    const ops = [
      ...['сад', 'море', 'гора'].map((word, i) => ({ type: 'answer', t: 1000 + i, day: '2026-10-30', word, ok: true, source: 'game', mode: 'mix' })),
      { type: 'profile', avatar: 'я'.repeat(5000) },
    ]
    await s.call('POST', '/api/ops', OWNER, { ops })
    await s.call('POST', '/api/guests', OWNER, { hours: 1, label: 'Лера' })
  })
  const rows = (table, query = '') => s.call('GET', `/api/db/tables/${table}${query}`, OWNER)

  test('закрыто токеном, гостю 403', async () => {
    assert.equal((await s.call('GET', '/api/db/tables')).status, 401)
    const g = await (await s.call('POST', '/api/guests', OWNER, { hours: 1 })).json()
    assert.equal((await s.call('GET', '/api/db/tables', g.token)).status, 403)
    assert.equal((await s.call('GET', '/api/db/tables/answers', g.token)).status, 403)
  })

  test('список таблиц с числом строк', async () => {
    const t = await (await s.call('GET', '/api/db/tables', OWNER)).json()
    const by = Object.fromEntries(t.map(x => [x.name, x.rows]))
    for (const name of ['answers', 'words', 'days', 'guests', 'notes', 'images', 'events', 'meta']) assert.ok(name in by, name)
    assert.equal(by.answers, 3)
    assert.equal(by.words, 3)
    assert.ok(!Object.keys(by).some(n => n.startsWith('sqlite_')))
  })

  test('строки таблицы: колонки, новые сверху, общее число', async () => {
    const r = await (await rows('answers')).json()
    assert.deepEqual(r.columns.map(c => c.name), ['id', 't', 'word', 'ok', 'source', 'mode', 'xp'])
    assert.equal(r.total, 3)
    assert.deepEqual(r.rows.map(x => x.word), ['гора', 'море', 'сад'])
  })

  test('поиск по всем колонкам, спецсимволы ищутся как текст', async () => {
    assert.deepEqual((await (await rows('answers', '?q=мор')).json()).rows.map(x => x.word), ['море'])
    assert.equal((await (await rows('answers', '?q=game')).json()).total, 3)
    assert.equal((await (await rows('answers', '?q=нет-такого')).json()).total, 0)
    assert.equal((await (await rows('answers', '?q=%25')).json()).total, 0, '«%» не работает как маска')
    assert.equal((await (await rows('answers', "?q='%20OR%201=1--")).json()).total, 0, 'SQL из строки поиска не выполняется')
  })

  test('страницы: limit и offset, лишние значения ограничиваются', async () => {
    const p = await (await rows('answers', '?limit=2&offset=1')).json()
    assert.deepEqual(p.rows.map(x => x.word), ['море', 'сад'])
    assert.deepEqual([p.limit, p.offset, p.total], [2, 1, 3])
    assert.equal((await (await rows('answers', '?limit=99999')).json()).limit, 200)
    assert.equal((await (await rows('answers', '?limit=abc&offset=-5')).json()).limit, 50)
  })

  test('хэш гостевого токена скрыт, длинные значения обрезаются', async () => {
    const all = (await (await rows('guests')).json()).rows
    assert.ok(all.every(g => g.hash === '••••••'), 'хэши скрыты у всех')
    assert.ok(all.some(g => g.label === 'Лера'))
    const meta = (await (await rows('meta')).json()).rows.find(r => r.key === 'profile')
    assert.ok(meta.value.length <= 301, 'аватарка не раздувает ответ')
    assert.ok(meta.value.endsWith('…'))
  })

  test('чужие названия таблиц и попытки инъекции — 404', async () => {
    for (const bad of ['sqlite_master', 'нет_такой', 'answers%22%3B%20DROP%20TABLE%20answers%3B--', '..%2fapp']) {
      assert.equal((await rows(bad)).status, 404, bad)
    }
    assert.equal((await (await rows('answers')).json()).total, 3, 'таблица цела')
  })
})
