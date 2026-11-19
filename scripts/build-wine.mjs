/**
 * Собирает `frontend/src/assets/wine.css` из `dark.css`: те же правила, но в винно-розовой палитре главной страницы (дизайн urimal-landing).
 * Запуск: `node scripts/build-wine.mjs` (перезаписывает файл), `node scripts/build-wine.mjs --check` (только проверка, код выхода 1, если файл отстал).
 * Правишь тёмную тему: правь `dark.css`, потом запусти скрипт. Тест `tests/docs-sync.test.mjs` следит, что файл свежий.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const HEX = {
  '#14152b': '#0b0508', '#e8e9ff': '#ffffff', '#a2a6d6': '#ffb3d1', '#7f6bf5': '#ff6fae', '#a898ff': '#ff9cc6', '#f07fc6': '#ff6fae',
  '#d9d3ff': '#ffd1e3', '#cbbfff': '#ffc4dc', '#7f83b8': '#d98fb0', '#1d1f42': '#2a0a18', '#23264f': '#33101f', '#8f7cf0': '#ff6fae',
  '#b9b4ff': '#ff9cc6', '#3a3c72': '#4a1a2f', '#b8a8ff': '#ff9cc6', '#b8b3ec': '#ffb3d1', '#5f7fd6': '#e85a9a', '#8c6fe0': '#ff6fae',
  '#20265c': '#2a0a18', '#4d5290': '#7a3a58', '#f2cf8e': '#ffd9a0', '#7863ff': '#ff6fae',
}
const RGB = {
  '37, 39, 78': '42, 10, 24', '30, 32, 66': '36, 8, 20', '26, 28, 58': '28, 7, 16', '26, 28, 62': '28, 7, 17', '32, 34, 72': '40, 10, 22', '28, 30, 62': '32, 8, 19',
  '14, 15, 40': '11, 5, 8', '5, 6, 20': '8, 3, 5', '165, 160, 255': '255, 190, 220', '143, 124, 240': '255, 111, 174', '160, 140, 255': '255, 130, 190',
  '70, 90, 190': '194, 24, 107', '150, 60, 130': '194, 24, 107', '90, 70, 190': '232, 62, 140', '20, 21, 43': '11, 5, 8',
}
const HEAD = `/* Винно-розовая палитра: data-theme="dark" + data-palette="wine" на <html> (режим «Розовая» в src/lib/theme.ts, по умолчанию).
   Файл собирается скриптом scripts/build-wine.mjs из dark.css: не правь его руками, правь dark.css и запусти скрипт. */
`

export function buildWine(dark) {
  let s = dark.replace(/^\/\* Тёмное оформление[^\n]*\n/, '').replaceAll("html[data-theme='dark']", "html[data-theme='dark'][data-palette='wine']")
  for (const [k, v] of Object.entries(HEX)) s = s.replaceAll(k, v)
  for (const [k, v] of Object.entries(RGB)) s = s.replaceAll(k, v)
  s = s.replace('rgba(11, 5, 8, .72), rgba(11, 5, 8, .72)', 'rgba(11, 5, 8, .86), rgba(11, 5, 8, .86)')
  return HEAD + s
}

const darkPath = new URL('../frontend/src/assets/dark.css', import.meta.url)
const winePath = new URL('../frontend/src/assets/wine.css', import.meta.url)
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const out = buildWine(readFileSync(darkPath, 'utf8'))
  if (process.argv.includes('--check')) {
    if (readFileSync(winePath, 'utf8') !== out) { console.error('wine.css отстал от dark.css: запусти node scripts/build-wine.mjs'); process.exit(1) }
  } else writeFileSync(winePath, out)
}
