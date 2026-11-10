import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'
import { cleanup, start } from './_server.mjs'
import { OUT, build, data } from '../scripts/build-study-data.mjs'

after(close)
after(cleanup)

describe('открытые списки: пройденная грамматика и предложения', () => {
  test('файл совпадает с данными сайта (иначе: node scripts/build-study-data.mjs)', async () => {
    assert.equal(readFileSync(OUT, 'utf8'), await build())
  })

  test('в грамматике только пройденные карточки, без разметки сайта', async () => {
    const { G } = await load('/src/data/korean/grammar.ts')
    const { grammar } = await data()
    assert.deepEqual(grammar.map(g => g.id), G.filter(g => g.st === 'ok').map(g => g.id))
    assert.ok(grammar.length > 0)
    const text = JSON.stringify(grammar)
    assert.ok(!/\{[a-z]\|/.test(text), 'осталась разметка {o|…}')
    assert.ok(!/<[a-z/][^>]*>/i.test(text), 'остались теги')
    assert.ok(!text.includes('**'), 'осталась разметка **…**')
    for (const g of grammar) assert.ok(g.ko && g.ru && g.blocks.length, g.id)
  })

  test('в предложениях все переводы сайта, без повторов и пустых', async () => {
    const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
    const { sentences } = await data()
    const kos = new Set(sentences.map(s => s.ko))
    assert.equal(kos.size, sentences.length, 'повторы предложений')
    for (const ko of Object.keys(TRANSLATIONS)) assert.ok(kos.has(ko), ko)
    for (const s of sentences) assert.ok(s.ko.trim() && s.ru.trim(), JSON.stringify(s))
  })
})

describe('сервер: открытые списки', () => {
  let s
  before(async () => (s = await start()))

  test('грамматика и предложения отдаются без токена, с кэшем и без личного', async () => {
    for (const [url, key] of [['/api/public/grammar', 'grammar'], ['/api/public/sentences', 'sentences']]) {
      const r = await s.call('GET', url)
      assert.equal(r.status, 200, url)
      assert.match(r.headers.get('content-type') ?? '', /application\/json/)
      assert.match(r.headers.get('cache-control') ?? '', /max-age=900/)
      const text = await r.text()
      const body = JSON.parse(text)
      assert.equal(body.count, body[key].length)
      assert.ok(body.count > 0)
      assert.ok(!/token|bearer|password/i.test(text), 'в ответе нет секретов')
    }
  })
})
