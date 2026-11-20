/**
 * Список слов для «Прогноза TOPIK I» (`/korean/topik`): слова начального уровня «한국어 학습용 어휘 목록» (уровень A, 국립국어원, 공공누리 제1유형;
 * рейтинг частоты по «현대 국어 사용 빈도 조사») с русским переводом из 한국어기초사전 (CC BY-SA 2.0 KR).
 * Нужен локальный файл `материалы/словарь-krdict/krdict_ko_ru.json` (в git нет). Результат лежит в git: `frontend/src/data/korean/topik-pool.ts`.
 * Запуск: `node scripts/build-topik-pool.mjs`. Не входит в `npm run sync` (файла словаря нет в CI).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const vocabSrc = readFileSync(fileURLToPath(new URL('backend/src/dict/dict.vocab.ts', root)), 'utf8')
const rows = [...vocabSrc.matchAll(/\[(\d+),"([^"]+)","([^"]*)","([ABC])"\]/g)].map(m => ({ rank: +m[1], word: m[2], pos: m[3], level: m[4] }))
const raw = JSON.parse(readFileSync(fileURLToPath(new URL('материалы/словарь-krdict/krdict_ko_ru.json', root)), 'utf8')).entries
const OK_POS = { 명사: 'сущ.', 동사: 'глаг.', 형용사: 'прил.', 부사: 'нареч.', 대명사: 'мест.', 수사: 'числ.', 관형사: 'опр.' }
/**
 * Из перевода берём один понятный вариант: в словаре они через «;», у глаголов скобки «[по]терять» значат необязательную приставку.
 * Скобки убираем («потерять»), из вариантов выбираем самый короткий (так вместо «трапеза; обед; пища» выйдет «обед»), пояснения в круглых скобках отбрасываем.
 */
const clean = t => {
  const variants = t.split(/[;,]/).map(v => v.replace(/\([^)]*\)/g, '').replace(/[\[\]]/g, '').trim()).filter(v => /^[а-яё -]{2,}$/i.test(v))
  return variants.sort((a, b) => a.length - b.length)[0] ?? ''
}
const byWord = new Map()
for (const e of raw) {
  if (e.vocabulary_level !== '초급') continue
  const tr = clean(e.senses?.[0]?.translations?.[0]?.translation ?? '')
  if (!tr) continue
  const k = e.word + '|' + e.part_of_speech
  if (!byWord.has(k)) byWord.set(k, tr)
}
/** Слова, где самый короткий вариант словаря вводит в заблуждение. */
const FIX = { 식사: 'еда' }
const out = []
const seen = new Set()
for (const r of rows.filter(r => r.level === 'A' && OK_POS[r.pos])) {
  const ru = FIX[r.word] ?? byWord.get(r.word + '|' + r.pos)
  if (!ru || ru.length > 28 || seen.has(r.word)) continue
  seen.add(r.word)
  out.push([r.rank, r.word, OK_POS[r.pos], ru])
}
const text = `// Создано scripts/build-topik-pool.mjs из «한국어 학습용 어휘 목록» (국립국어원, уровень A, 공공누리 제1유형) и 한국어기초사전 (CC BY-SA 2.0 KR). Не править руками.
// Строка: [рейтинг частоты, слово, часть речи, перевод]. Из них «Прогноз TOPIK I» берёт случайные слова для теста словарного запаса.
export const TOPIK_POOL: [number, string, string, string][] = [
${out.map(r => '  ' + JSON.stringify(r)).join(',\n')},
]
`
writeFileSync(fileURLToPath(new URL('frontend/src/data/korean/topik-pool.ts', root)), text)
console.log('слов уровня A в списке:', rows.filter(r => r.level === 'A').length, '; с переводом и нужной частью речи:', out.length)
