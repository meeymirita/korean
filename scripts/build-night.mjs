/**
 * Собирает `frontend/src/assets/night.css` из `dark.css`: те же правила, но с тёплой приглушённой палитрой вместо холодного индиго.
 * Запуск: `node scripts/build-night.mjs` (перезаписывает файл), `node scripts/build-night.mjs --check` (только проверка, код выхода 1, если файл отстал).
 * Правишь тёмную тему: правь `dark.css`, потом запусти скрипт. Тест `tests/docs-sync.test.mjs` следит, что файл свежий.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const HEX = {
  '#14152b': '#1a1519', '#e8e9ff': '#e4d9d2', '#a2a6d6': '#b0a19c', '#7f6bf5': '#a9687f', '#a898ff': '#d2a0b0', '#f07fc6': '#e39aa8',
  '#d9d3ff': '#ecd3d8', '#cbbfff': '#e3c3cb', '#7f83b8': '#9b8a88', '#1d1f42': '#2a2128', '#23264f': '#30262d', '#8f7cf0': '#bd7f92',
  '#b9b4ff': '#d9a9b6', '#3a3c72': '#4d3c45', '#b8a8ff': '#e0aab8', '#b8b3ec': '#d4b1b9', '#5f7fd6': '#b07585', '#8c6fe0': '#c68a98',
  '#20265c': '#3d2230', '#4d5290': '#6d4a58', '#f2cf8e': '#ecc796', '#7863ff': '#a9687f',
}
const RGB = {
  '37, 39, 78': '44, 35, 42', '30, 32, 66': '38, 30, 36', '26, 28, 58': '34, 27, 32', '26, 28, 62': '34, 27, 33', '32, 34, 72': '42, 33, 40', '28, 30, 62': '36, 29, 35',
  '14, 15, 40': '20, 15, 19', '5, 6, 20': '10, 6, 9', '165, 160, 255': '222, 170, 180', '143, 124, 240': '196, 120, 140', '160, 140, 255': '214, 140, 160',
  '70, 90, 190': '150, 80, 100', '150, 60, 130': '170, 90, 90', '90, 70, 190': '140, 70, 100',
}
const HEAD = `/* Ночная палитра: data-theme="dark" + data-palette="night" на <html> (режим «Ночная» в src/lib/theme.ts).
   Файл собирается скриптом scripts/build-night.mjs из dark.css: не правь его руками, правь dark.css и запусти скрипт. */
`

export function buildNight(dark) {
  let s = dark.replace(/^\/\* Тёмное оформление[^\n]*\n/, '').replaceAll("html[data-theme='dark']", "html[data-theme='dark'][data-palette='night']")
  for (const [k, v] of Object.entries(HEX)) s = s.replaceAll(k, v)
  s = s.replaceAll('%23b9b4ff', '%23d9a9b6')
  for (const [k, v] of Object.entries(RGB)) s = s.replaceAll(k, v)
  s = s.replace('rgba(20, 15, 19, .72), rgba(20, 15, 19, .72)', 'rgba(20, 15, 19, .84), rgba(20, 15, 19, .84)').replace('rgba(0, 0, 0, .35)', 'rgba(0, 0, 0, .28)')
  return HEAD + s
}

const darkPath = new URL('../frontend/src/assets/dark.css', import.meta.url)
const nightPath = new URL('../frontend/src/assets/night.css', import.meta.url)
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  const out = buildNight(readFileSync(darkPath, 'utf8'))
  if (process.argv.includes('--check')) {
    if (readFileSync(nightPath, 'utf8') !== out) { console.error('night.css отстал от dark.css: запусти node scripts/build-night.mjs'); process.exit(1) }
  } else writeFileSync(nightPath, out)
}
