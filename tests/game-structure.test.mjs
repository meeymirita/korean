import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Движок игры разрезан: генераторы заданий в generators.ts, отрисовка и события в engine.ts. Тест не даёт файлам снова распухнуть.
const read = f => readFileSync(new URL(`../frontend/src/game/${f}`, import.meta.url), 'utf8')
const lines = f => read(f).split('\n').length

describe('движок игры: файлы', () => {
  test('engine.ts не раздувается (до 1200 строк), generators.ts до 1800: больше режимов: режь по темам и выноси в новые файлы', () => {
    assert.ok(lines('engine.ts') <= 1200, `engine.ts ${lines('engine.ts')} строк`)
    assert.ok(lines('generators.ts') <= 1800, `generators.ts ${lines('generators.ts')} строк`)
  })
  test('генераторы лежат в generators.ts, а engine.ts только вызывает фабрику', () => {
    const eng = read('engine.ts')
    assert.ok(read('generators.ts').includes('export function createGenerators('))
    assert.ok(eng.includes('createGenerators(S, hooks)'))
    assert.equal((eng.match(/^function gen[A-Z]/gm) ?? []).length, 0, 'генераторы gen… переехали в generators.ts')
  })
  test('в движке нет @ts-nocheck и any', () => {
    for (const f of ['engine.ts', 'generators.ts', 'util.ts']) {
      const s = read(f)
      assert.ok(!s.includes('@ts-nocheck'), f)
      assert.ok(!/:\s*any\b|as any\b|<any>/.test(s), `${f}: any`)
    }
  })
})
