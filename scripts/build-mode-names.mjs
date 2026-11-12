// Названия режимов для сервера: недельный отчёт по занятиям (PDF в Telegram) подписывает упражнения так же, как сайт.
// Пишет backend/src/study/mode-names.ts из каталога игр и списка режимов отчёта. Запуск: node scripts/build-mode-names.mjs
// (после нового режима игры или тренажёра). Тест tests/mode-names.test.mjs следит, что файл не отстал.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../backend/src/study/mode-names.ts', import.meta.url))

/** id режима → название, как `modeName` на сайте (каталог игр главнее списка отчёта). */
export async function names() {
  const { ALL_GAMES } = await load('/src/data/games.ts')
  const { EXTRA_MODES } = await load('/src/data/report.ts')
  const all = { ...EXTRA_MODES, ...Object.fromEntries(ALL_GAMES.map(g => [g.id, g.name])) }
  return Object.fromEntries(Object.entries(all).sort(([a], [b]) => (a < b ? -1 : 1)))
}

export async function build() {
  const rows = Object.entries(await names()).map(([id, name]) => `  ${JSON.stringify(id)}: ${JSON.stringify(name)},`)
  return `// Файл создаёт scripts/build-mode-names.mjs из данных сайта, руками не править.
/** Названия режимов игр и тренажёров (как \`modeName\` на сайте). */
export const MODE_NAMES: Record<string, string> = {
${rows.join('\n')}
}

export const modeName = (mode: string): string => (mode ? (MODE_NAMES[mode] ?? mode) : 'без режима')
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
