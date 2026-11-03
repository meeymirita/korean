import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { SITE_GROUPS } = await load('/src/data/korean/sites.ts')
after(close)

describe('полезные сайты', () => {
  test('у каждого сайта https-адрес, название и описание, адреса не повторяются', () => {
    const urls = new Set()
    for (const g of SITE_GROUPS) {
      assert.ok(g.sites.length > 0, g.id)
      for (const s of g.sites) {
        assert.match(s.url, /^https:\/\/[\w.-]+(\/[\w@./-]*)?$/, s.url)
        assert.ok(s.name.trim() && s.desc.length > 20, s.name)
        assert.ok(!urls.has(s.url), `повтор ${s.url}`)
        urls.add(s.url)
      }
    }
  })
  test('в тексте нет японских и китайских знаков', () => {
    assert.ok(!/[぀-ヿ一-鿿]/.test(JSON.stringify(SITE_GROUPS)))
  })
})
