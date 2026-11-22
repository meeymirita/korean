// Светлая тема открытых страниц (по умолчанию, решение владельца 2026-11-22): правило в pink.css и кнопка смены темы в оболочке.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = p => readFileSync(fileURLToPath(new URL(`../frontend/src/${p}`, import.meta.url)), 'utf8')

test('pink.css: светлый вариант включается без data-theme="dark", картинки не инвертируются', () => {
  const css = read('assets/pink.css')
  assert.match(css, /html:not\(\[data-theme='dark'\]\) \.pk \{[^}]*filter: invert\(1\) hue-rotate\(180deg\)/)
  assert.match(css, /html:not\(\[data-theme='dark'\]\) \.pk :is\(img[^)]*\)\s*\{[^}]*filter: invert\(1\) hue-rotate\(180deg\)/)
})

test('оболочка PinkShell: кнопка темы по умолчанию есть, подпись зависит от темы', () => {
  const v = read('components/site/PinkShell.vue')
  assert.match(v, /themeToggle: true/)
  assert.match(v, /themeDark \? '☀︎ Светлая' : '☾ Тёмная'/)
})
