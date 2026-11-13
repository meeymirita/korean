import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close } from './_load.mjs'
import { OUT, build } from '../scripts/words-export-vocab.mjs'

after(close)

describe('«Скачать мои слова»: словарь для файла', () => {
  test('файл совпадает с данными сайта (иначе: node scripts/words-export-vocab.mjs)', async () => {
    assert.equal(readFileSync(OUT, 'utf8'), await build())
  })
})
