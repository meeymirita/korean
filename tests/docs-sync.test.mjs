import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { sections } = await load('/src/data/korean/sections.ts')
const { TOOL_IDS } = await load('/src/data/games.ts')
after(close)

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const claude = read('CLAUDE.md')

describe('документация не расходится с кодом', () => {
  test('каждый файл из docs/ упомянут в таблице документации CLAUDE.md', () => {
    for (const f of readdirSync(new URL('../docs/', import.meta.url)).filter(x => x.endsWith('.md'))) {
      assert.ok(claude.includes('`docs/' + f + '`'), `docs/${f} нет в CLAUDE.md`)
    }
  })

  test('каждая страница раздела корейского названа в маршрутах CLAUDE.md', () => {
    const skip = new Set(['ref'])
    for (const s of sections) {
      if (skip.has(s.id) || s.group === 'ref') continue
      // страницы-тренажёры открываются только через /game/home?game=<id>, их id тоже указан в маршрутах
      assert.ok(new RegExp('`' + s.id + '`').test(claude) || claude.includes('/korean/' + s.id), `раздел ${s.id} не описан в маршрутах`)
    }
  })

  test('каждый тренажёр каталога описан в docs/games-catalog.md', () => {
    const catalog = read('docs/games-catalog.md')
    for (const id of TOOL_IDS) assert.ok(catalog.includes('| ' + id + ' |'), `тренажёр ${id} нет в каталоге`)
  })


  test('в README перечислены все файлы docs/', () => {
    const readme = read('README.md')
    for (const f of readdirSync(new URL('../docs/', import.meta.url)).filter(x => x.endsWith('.md'))) {
      assert.ok(readme.includes(f.replace('.md', '')), `README не упоминает ${f}`)
    }
  })
})

describe('ночная тема не отстаёт от тёмной', () => {
  test('night.css получен из dark.css скриптом scripts/build-night.mjs (запусти его, если тест упал)', async () => {
    const { buildNight } = await import('../scripts/build-night.mjs')
    assert.equal(read('frontend/src/assets/night.css'), buildNight(read('frontend/src/assets/dark.css')))
  })
  test('night.css подключён после dark.css', () => {
    const main = read('frontend/src/assets/main.css')
    assert.ok(main.indexOf('night.css') > main.indexOf('dark.css') && existsSync(new URL('../frontend/src/assets/night.css', import.meta.url)))
  })
})
