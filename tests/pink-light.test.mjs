// Открытые страницы в светлой теме (единственной, решение владельца 2026-11-25): правило в pink.css; кнопки смены темы в оболочке больше нет.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = p => readFileSync(fileURLToPath(new URL(`../frontend/src/${p}`, import.meta.url)), 'utf8')

test('pink.css: светлый вариант включён всегда, картинки не инвертируются', () => {
  const css = read('assets/pink.css')
  assert.match(css, /^\.pk \{[^}]*filter: invert\(1\) hue-rotate\(180deg\)/m)
  assert.match(css, /^\.pk :is\(img[^)]*\)\s*\{[^}]*filter: invert\(1\) hue-rotate\(180deg\)/m)
})

test('оболочка PinkShell: кнопки смены темы нет', () => {
  const v = read('components/site/PinkShell.vue')
  assert.doesNotMatch(v, /themeToggle|toggleTheme|themeDark/)
})
