import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'
import { OUT, build, names } from '../scripts/build-mode-names.mjs'

after(close)

describe('названия режимов для сервера (недельный отчёт по занятиям)', () => {
  test('файл совпадает с данными сайта (иначе: node scripts/build-mode-names.mjs)', async () => {
    assert.equal(readFileSync(OUT, 'utf8'), await build())
  })

  test('названия те же, что показывает сайт', async () => {
    const { modeName } = await load('/src/data/report.ts')
    const all = await names()
    assert.ok(Object.keys(all).length > 30)
    for (const [id, name] of Object.entries(all)) assert.equal(name, modeName(id), id)
  })
})
