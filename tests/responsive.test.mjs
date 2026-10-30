import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const css = n => readFileSync(new URL(`../src/assets/${n}`, import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('вёрстка для разных размеров экрана', () => {
  test('в index.html есть viewport, без него телефон рисует «настольную» страницу', () => {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/)
  })

  test('у основных таблиц стилей есть правила для узкого экрана', () => {
    for (const f of ['study.css', 'cabinet.css', 'sky.css']) assert.match(css(f), /@media \(max-width: ?\d+px\)/, f)
  })

  test('широкая таблица справочника листается внутри себя, а не растягивает страницу', () => {
    assert.match(css('study.css'), /@media \(max-width: 640px\) \{[^}]*table\.t \{[^}]*overflow-x: auto/)
  })

  test('нигде нет жёсткого min-width больше ширины телефона без min(…, 100%)', () => {
    const files = readdirSync(new URL('../src/assets/', import.meta.url)).filter(f => f.endsWith('.css'))
    for (const f of files) {
      // таблица хангыля (.hg) лежит в блоке с горизонтальной прокруткой, ей широкая ширина разрешена
      for (const m of css(f).replace(/\.hg table \{[^}]*\}/g, '').matchAll(/(?<!\()min-width:\s*(\d+)px/g)) {
        assert.ok(Number(m[1]) <= 300, `${f}: min-width ${m[1]}px шире экрана 320px`)
      }
    }
  })

  test('инструмент проверки вёрстки (scripts/check-layout.mjs) без ошибок синтаксиса и просит токен демо-сервера', () => {
    const file = path.resolve('scripts/check-layout.mjs')
    assert.equal(spawnSync(process.execPath, ['--check', file]).status, 0)
    const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /TOKEN/)
  })
})
