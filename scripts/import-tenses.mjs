// @ts-check
// Загрузка слов с тремя временами в frontend/src/data/korean/tenses.ts из проверенного items.json.
// Запуск: node scripts/import-tenses.mjs <путь к items.json>. Без пути пишет пустой файл (ничего не показывается).
// Формат пункта items.json: { k, present, past, future, presS, presR, pastS, pastR, futS, futR }.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../frontend/src/data/korean/tenses.ts', import.meta.url))
const src = process.argv[2]
/** @type {Record<string, any>[]} */
const items = src ? JSON.parse(readFileSync(src, 'utf8')) : []
const q = (/** @type {string} */ s) => JSON.stringify(s)
const entries = items.map(i => {
  for (const f of ['k', 'present', 'past', 'future', 'presS', 'presR', 'pastS', 'pastR', 'futS', 'futR']) if (!i[f]) throw new Error(`${i.id ?? i.k}: пусто поле ${f}`)
  return `  ${q(i.k)}: { f: [${q(i.present)}, ${q(i.past)}, ${q(i.future)}], s: [[${q(i.presS)}, ${q(i.presR)}], [${q(i.pastS)}, ${q(i.pastR)}], [${q(i.futS)}, ${q(i.futR)}]] },`
})
const head = `/**
 * Глаголы и прилагательные в трёх временах: формы вежливого стиля и по предложению с переводом на каждое время.
 * Файл собирает \`node scripts/import-tenses.mjs <items.json>\` из проверенного материала; руками не править.
 * Показывается в таблице слов (колонки «Настоящее / Прошедшее / Будущее») и в раскрытом разборе слова.
 */
export type Tense = 'present' | 'past' | 'future'

export interface TenseEntry {
  /** формы: настоящее, прошедшее, будущее («갈 거예요») */
  f: [string, string, string]
  /** предложения [корейское, русское]: настоящее, прошедшее, будущее */
  s: [[string, string], [string, string], [string, string]]
}

export const TENSE_NAMES: Record<Tense, string> = { present: 'Настоящее', past: 'Прошедшее', future: 'Будущее' }
export const TENSE_ORDER: Tense[] = ['present', 'past', 'future']

export const TENSES: Record<string, TenseEntry> = {
`
writeFileSync(OUT, head + entries.join('\n') + (entries.length ? '\n' : '') + '}\n')
console.log(`tenses.ts: ${items.length} слов`)
