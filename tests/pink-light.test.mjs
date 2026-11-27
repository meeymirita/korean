// Открытые страницы в светлой теме (единственной, решение владельца 2026-11-25): цвета в pink.css светлые сами (фильтр invert убран 2026-11-27); кнопки смены темы в оболочке больше нет.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = p => readFileSync(fileURLToPath(new URL(`../frontend/src/${p}`, import.meta.url)), 'utf8')

test('pink.css: цвета светлые сами, без инверсии фильтром и без тёмных красок', () => {
  const css = read('assets/pink.css')
  assert.doesNotMatch(css, /invert\(/)
  assert.match(css, /--pk-bg: #fbf8ff/)
  assert.match(css, /color-scheme: light/)
  assert.doesNotMatch(css, /#2a0a18|#0b0508|#12070c|color-scheme: dark/)
})

test('окна главной и словарь не держат тёмную винную палитру', () => {
  for (const f of ['components/home/AccessRequest.vue', 'components/home/HomeGuideDrawer.vue', 'components/dict/DictShell.vue', 'components/dict/DictWordList.vue', 'views/AboutView.vue', 'views/HistoryView.vue'])
    assert.doesNotMatch(read(f), /#2a0a18|#5a1537|rgba\(11, ?5, ?8|rgba\(20, ?6, ?12/, f)
})

test('оболочка PinkShell: кнопки смены темы нет', () => {
  const v = read('components/site/PinkShell.vue')
  assert.doesNotMatch(v, /themeToggle|toggleTheme|themeDark/)
})
