import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'
import { OUT, build } from '../scripts/build-words-json.mjs'

after(close)

describe('публичный words.json', () => {
  test('файл совпадает с данными сайта (иначе: node scripts/build-words-json.mjs)', async () => {
    assert.equal(readFileSync(OUT, 'utf8'), await build())
  })

  test('в файле все слова, только словарные поля и нет личного', async () => {
    const { RAW } = await load('/src/data/korean/dictionary.ts')
    const text = readFileSync(OUT, 'utf8')
    const data = JSON.parse(text)
    assert.equal(data.count, RAW.length)
    assert.equal(data.words.length, RAW.length)
    const keys = ['n', 'ko', 'reading', 'ru', 'categories', 'example', 'example_ru']
    for (const w of data.words) assert.deepEqual(Object.keys(w), keys, w.ko)
    assert.equal(new Set(data.words.map(w => w.ko)).size, data.words.length, 'повторы слов')
    assert.ok(!/token|bearer|password/i.test(text), 'в файле нет секретов')
  })
})
