import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { CULTURE, CULTURE_CATS } = await load('/src/data/korean/culture.ts')
after(close)

describe('культура Кореи: карточки', () => {
  test('у каждой карточки свой id, известная категория и непустой текст', () => {
    assert.ok(CULTURE.length >= 10)
    const ids = new Set()
    for (const c of CULTURE) {
      assert.ok(!ids.has(c.id), `повтор id ${c.id}`)
      ids.add(c.id)
      assert.ok(Object.keys(CULTURE_CATS).includes(c.cat), `неизвестная категория ${c.cat}`)
      assert.ok(c.title.trim().length > 0)
      assert.ok(c.text.trim().length > 10, c.id)
    }
  })

  test('в тексте нет японских и китайских знаков', () => {
    const all = JSON.stringify(CULTURE)
    assert.ok(!/[぀-ヿ一-鿿]/.test(all))
  })
})
