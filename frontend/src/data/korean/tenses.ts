/**
 * Глаголы и прилагательные в трёх временах: формы вежливого стиля и по предложению с переводом на каждое время.
 * Файл собирает `node scripts/import-tenses.mjs <items.json>` из проверенного материала; руками не править.
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
}
