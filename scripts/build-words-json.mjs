// Публичный словарь для сверки на дубли: frontend/public/words.json (https://korean.meeymirita.ru/words.json).
// Только слова: никаких токенов, прогресса и данных пользователей. Запуск: node scripts/build-words-json.mjs
// (после изменения словаря или переводов). Тест tests/words-json.test.mjs следит, что файл не отстал.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../frontend/public/words.json', import.meta.url))

/** Текст words.json по текущим данным сайта (без даты, чтобы файл не менялся без причины). */
export async function build() {
  const { RAW, CAT, CATN } = await load('/src/data/korean/dictionary.ts')
  const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
  const cats = new Map()
  for (const [id, list] of Object.entries(CAT)) {
    for (const k of list) cats.set(k, [...(cats.get(k) ?? []), CATN[id] ?? id])
  }
  const words = RAW.map(r => ({
    n: r.n,
    ko: r.k,
    reading: r.r,
    ru: r.t,
    categories: cats.get(r.k) ?? [],
    example: r.s,
    example_ru: TRANSLATIONS[r.s] ?? '',
  }))
  return `{"count": ${words.length}, "words": [\n${words.map(w => JSON.stringify(w)).join(',\n')}\n]}\n`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
