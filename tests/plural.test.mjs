import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { plural } = await load('/src/lib/plural.ts')
after(close)
const FORMS = ['слово', 'слова', 'слов']

describe('склонение числительных', () => {
  test('1, 21, 101 → форма «слово»', () => {
    for (const n of [1, 21, 101, 121]) assert.equal(plural(n, FORMS), 'слово')
  })
  test('2–4, 22–24 → форма «слова»', () => {
    for (const n of [2, 3, 4, 22, 23, 24]) assert.equal(plural(n, FORMS), 'слова')
  })
  test('0, 5–20, 25 → форма «слов»', () => {
    for (const n of [0, 5, 6, 11, 12, 13, 14, 19, 20, 25]) assert.equal(plural(n, FORMS), 'слов')
  })
})
