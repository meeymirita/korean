// @ts-check
// Данные для страницы «Рост платформы» (`/growth`): коммиты по дням из `git log` и ключевые события из «Истории» (`history.ts`).
// Пишет frontend/src/data/growth.ts. Запуск: node scripts/build-commit-graph.mjs (после заметной порции работы; в `npm run sync` не входит:
// число коммитов растёт с каждым коммитом, и проверка `sync:check` не сходилась бы). Тест tests/growth.test.mjs следит только за формой данных.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { close, load } from '../tests/_load.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = fileURLToPath(new URL('../frontend/src/data/growth.ts', import.meta.url))

/** @typedef {{ d: string; n: number; cum: number; add: number; del: number }} Day */

const raw = execSync('git log --reverse --format="@@%H%x09%ad%x09%s" --date=short --shortstat', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
/** @type {Map<string, { n: number; add: number; del: number }>} */
const byDay = new Map()
/** @type {{ d: string; subject: string } | null} */
let first = null
let commits = 0
let cur = ''
for (const line of raw.split('\n')) {
  if (line.startsWith('@@')) {
    const [, d = '', subject = ''] = line.slice(2).split('\t')
    cur = d
    commits++
    first ??= { d, subject }
    const row = byDay.get(d) ?? { n: 0, add: 0, del: 0 }
    row.n++
    byDay.set(d, row)
  } else {
    const row = byDay.get(cur)
    if (!row) continue
    row.add += Number(/(\d+) insertion/.exec(line)?.[1] ?? 0)
    row.del += Number(/(\d+) deletion/.exec(line)?.[1] ?? 0)
  }
}
/** @type {Day[]} */
const days = []
let cum = 0
for (const [d, r] of [...byDay].sort((a, b) => a[0].localeCompare(b[0]))) {
  cum += r.n
  days.push({ d, n: r.n, cum, add: r.add, del: r.del })
}
const cumAt = (/** @type {string} */ date) => [...days].reverse().find(x => x.d <= date)?.cum ?? 1

// ключевые события: из «Истории» берём самые содержательные записи дня (по числу пунктов), чем занятее день, тем больше
/** @type {{ HISTORY: { date: string; title: string; summary: string; items: string[] }[] }} */
const { HISTORY } = await load('/src/data/history.ts')
close()
/** @type {Map<string, typeof HISTORY>} */
const hist = new Map()
for (const e of HISTORY) hist.set(e.date, [...(hist.get(e.date) ?? []), e])
const marks = [...hist]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .flatMap(([d, list]) =>
    [...list]
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, Math.min(4, Math.ceil(list.length / 6)))
      .map(e => ({ d, title: e.title, summary: e.summary, items: e.items.length, cum: cumAt(d) })),
  )

const files = execSync('git ls-files "*.ts" "*.vue" "*.mjs" "*.css"', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
let lines = 0
for (const f of files) lines += readFileSync(ROOT + f, 'utf8').split('\n').length

const data = { generated: days.at(-1)?.d ?? '', commits, first, lines, days, marks }
writeFileSync(
  OUT,
  `// Файл создаёт scripts/build-commit-graph.mjs из git log и «Истории», руками не править.
export interface GrowthDay { d: string; n: number; cum: number; add: number; del: number }
export interface GrowthMark { d: string; title: string; summary: string; items: number; cum: number }
export interface Growth { generated: string; commits: number; first: { d: string; subject: string } | null; lines: number; days: GrowthDay[]; marks: GrowthMark[] }

export const GROWTH: Growth = ${JSON.stringify(data, null, 1)}
`,
)
console.log(`коммитов ${commits}, дней ${days.length}, событий ${marks.length}, строк кода ${lines}`)
