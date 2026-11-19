import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { close } from './_load.mjs'
import { COUNTERS, GENERATORS, applyCounters, stale } from '../scripts/sync.mjs'

after(close)

// Один источник правды: всё производное собирается командой `npm run sync`, а этот тест не даёт про неё забыть.
describe('npm run sync', () => {
  test('все производные файлы совпадают с данными сайта (иначе: npm run sync)', async () => {
    const old = await stale()
    assert.deepEqual(old.map(t => t.name), [], 'отстало: запусти npm run sync')
  })

  test('каждый скрипт-генератор (OUT + build) записан в sync.mjs', () => {
    const dir = new URL('../scripts/', import.meta.url)
    const gens = readdirSync(dir)
      .filter(f => f.endsWith('.mjs') && f !== 'sync.mjs')
      .filter(f => {
        const src = readFileSync(new URL(f, dir), 'utf8')
        return /export const OUT\b/.test(src) && /export async function build\b/.test(src)
      })
      .map(f => f.replace('.mjs', ''))
    for (const g of gens) assert.ok(GENERATORS.includes(g), `скрипт ${g} строит файл, но его нет в GENERATORS (scripts/sync.mjs)`)
    for (const g of GENERATORS) assert.ok(gens.includes(g), `в GENERATORS есть ${g}, но такого генератора нет`)
  })

  test('числа подставляются на своё место, а пропавшее место замечается', () => {
    const n = { words: 7, rules: 3 }
    const text = 'Тут **1 слов** и **2 правил грамматики**, потом Сейчас 5 слов (с'
    assert.equal(applyCounters(text, 'README.md', n), 'Тут **7 слов** и **3 правил грамматики**, потом Сейчас 5 слов (с')
    assert.equal(applyCounters(text, 'docs/data.md', n), 'Тут **1 слов** и **2 правил грамматики**, потом Сейчас 7 слов (с')
    assert.throws(() => applyCounters('пусто', 'README.md', n), /нет места/)
    assert.ok(COUNTERS.length >= 3)
  })
})
