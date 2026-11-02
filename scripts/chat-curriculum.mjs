// Что помощник-чат знает о программе владельца: пройденные темы грамматики и слова словаря.
// Пишет backend/src/chat/curriculum.ts. Запуск: node scripts/chat-curriculum.mjs (после изменения словаря или грамматики).
// Тест tests/chat-prompt.test.mjs следит, что файл не отстал от данных сайта.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../backend/src/chat/curriculum.ts', import.meta.url))

/** Текст файла curriculum.ts по текущим данным сайта. */
export async function build() {
  const { G } = await load('/src/data/korean/grammar.ts')
  const { RAW } = await load('/src/data/korean/dictionary.ts')
  const grammar = G.filter(g => g.st === 'ok').map(g => `- ${g.ko} — ${g.ru}`)
  const words = [...new Set(RAW.map(r => r.k))]
  return `// Файл создаёт scripts/chat-curriculum.mjs из данных сайта, руками не править.
/** Пройденные темы грамматики (карточки со статусом «пройдено»). */
export const KNOWN_GRAMMAR = ${JSON.stringify(grammar.join('\n'))}

/** Все слова словаря владельца. */
export const KNOWN_WORDS = ${JSON.stringify(words.join(' '))}
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
