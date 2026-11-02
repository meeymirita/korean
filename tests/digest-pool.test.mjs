import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close } from './_load.mjs'
import { FUTURE, OUT, build } from '../scripts/digest-pool.mjs'

after(close)

describe('письмо-подборка: слова и предложения', () => {
  test('файл совпадает с данными сайта (иначе: node scripts/digest-pool.mjs)', async () => {
    assert.equal(readFileSync(OUT, 'utf8'), await build())
  })

  test('в подборке много слов и предложений, будущего времени нет, всё с переводом', async () => {
    const { DIGEST_WORDS, DIGEST_SENTENCES } = await import('../server/dist/digest/pool.js')
    assert.ok(DIGEST_WORDS.length > 400, 'слов мало')
    assert.ok(DIGEST_SENTENCES.length > 400, 'предложений мало')
    for (const [k, r] of [...DIGEST_WORDS, ...DIGEST_SENTENCES]) assert.ok(k && r, `пустая пара: ${k}`)
    for (const [k] of DIGEST_SENTENCES) assert.ok(!FUTURE.test(k), `будущее время: ${k}`)
    assert.equal(new Set(DIGEST_SENTENCES.map(s => s[0])).size, DIGEST_SENTENCES.length, 'повторы предложений')
  })
})
