// Открытые страницы в светлой теме (единственной, решение владельца 2026-11-25): правило в pink.css; кнопки смены темы в оболочке больше нет.
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

test('оболочка PinkShell: кнопки смены темы нет', () => {
  const v = read('components/site/PinkShell.vue')
  assert.doesNotMatch(v, /themeToggle|toggleTheme|themeDark/)
})
