// @ts-check
// Слова для «Скачать мои слова» (кабинет → Настройки): корейское, чтение русскими буквами, перевод.
// Берутся слова для заданий (STUDY, без «дополнительных»). Пишет backend/src/wordsexport/vocab.ts.
// Запуск: node scripts/words-export-vocab.mjs (после изменения словаря). Тест tests/words-export-vocab.test.mjs следит.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../backend/src/wordsexport/vocab.ts', import.meta.url))

/** Текст файла vocab.ts по текущим данным сайта. */
export async function build() {
  /** @type {{ STUDY: { k: string; r: string; t: string }[] }} */
  const { STUDY } = await load('/src/data/korean/study.ts')
  const rows = STUDY.map(d => '  ' + JSON.stringify([d.k, d.r, d.t])).join(',\n')
  return `// Файл создаёт scripts/words-export-vocab.mjs из данных сайта, руками не править.
/** Слова для заданий (STUDY): [по-корейски, чтение русскими буквами, перевод]. */
export const EXPORT_VOCAB: [string, string, string][] = [
${rows},
]
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
