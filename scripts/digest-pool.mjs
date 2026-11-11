// @ts-check
// Слова и предложения для письма-подборки (кабинет → Настройки → «Подборка на повторение»).
// Пишет backend/src/digest/pool.ts. Запуск: node scripts/digest-pool.mjs (после изменения словаря или переводов).
// Тест tests/digest-pool.test.mjs следит, что файл не отстал от данных сайта.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../backend/src/digest/pool.ts', import.meta.url))
/** Ещё не пройденные формы будущего и обещаний: такие предложения в письмо не берём. «-(으)ㄹ 거예요» пройдено (2026-11-09) и берётся. */
export const FUTURE = /거에요|겠|게요|ㄹ까요|을까요/

/** @typedef {{ n: number; k: string; r: string; t: string; s: string }} RawWord слово словаря сайта (dictionary.ts) */

/** Текст файла pool.ts по текущим данным сайта. */
export async function build() {
  /** @type {{ RAW: RawWord[] }} */
  const { RAW } = await load('/src/data/korean/dictionary.ts')
  /** @type {{ TRANSLATIONS: Record<string, string> }} */
  const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
  /** @type {{ short: (t: string) => string }} */
  const { short } = await load('/src/data/korean/tasks.ts')
  const words = RAW.map(r => [r.k, short(r.t)])
  const seen = new Set()
  /** @type {[string, string][]} */
  const sentences = []
  for (const r of RAW) {
    const ru = TRANSLATIONS[r.s]
    if (!r.s || !ru || FUTURE.test(r.s) || seen.has(r.s)) continue
    seen.add(r.s)
    sentences.push([r.s, ru])
  }
  /** @param {unknown[]} a */
  const rows = a => a.map(x => '  ' + JSON.stringify(x)).join(',\n')
  return `// Файл создаёт scripts/digest-pool.mjs из данных сайта, руками не править.
/** Слова словаря: [по-корейски, перевод]. */
export const DIGEST_WORDS: [string, string][] = [
${rows(words)},
]

/** Предложения из примеров словаря без непройденных форм будущего: [по-корейски, перевод]. */
export const DIGEST_SENTENCES: [string, string][] = [
${rows(sentences)},
]
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
