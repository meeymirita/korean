// @ts-check
// Что помощник-чат знает о программе владельца: пройденные темы грамматики и слова словаря.
// Пишет backend/src/chat/curriculum.ts. Запуск: node scripts/chat-curriculum.mjs (после изменения словаря или грамматики).
// Тест tests/chat-prompt.test.mjs следит, что файл не отстал от данных сайта.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../backend/src/chat/curriculum.ts', import.meta.url))

/** @typedef {{ n: number; k: string; r: string; t: string; s: string }} RawWord слово словаря сайта (dictionary.ts) */

/** Без разметки сайта: цвета `{k|…}`, переносы `<br>`, жирный `**…**`. */
const strip = t => String(t).replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/<br\s*\/?>/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

/** Краткие правила пройденных карточек (формула, правило, частая ошибка, один пример): голосовой собеседник объясняет строго по ним, а не по памяти модели. */
function rulesOf(G) {
  const seen = new Set()
  const out = []
  for (const g of G.filter(x => x.st === 'ok')) {
    const key = g.ko.split(' ')[0]
    if (seen.has(key)) continue
    seen.add(key)
    const f = g.b.find(x => x[0] === 'formula')?.[1]
    const r = g.b.find(x => x[0] === 'rule')?.[1]
    const w = g.b.find(x => x[0] === 'warn')?.[1]
    const ex = g.b.find(x => x[0] === 'ex')?.[1]?.[0]
    const t = `${g.ko}: ` + [f && strip(f), r && strip(r), w && 'Ошибка: ' + strip(w), ex && `Пример: ${strip(ex[0])} (${strip(ex[1])})`].filter(Boolean).join(' | ')
    out.push(t.length > 420 ? t.slice(0, 420).replace(/[^.!?»)]*$/, '') || t.slice(0, 420) : t)
  }
  return out
}

/** Текст файла curriculum.ts по текущим данным сайта. */
export async function build() {
  /** @type {{ G: { ko: string; ru: string; st: string; b: any[][] }[] }} */
  const { G } = await load('/src/data/korean/grammar.ts')
  /** @type {{ RAW: RawWord[] }} */
  const { RAW } = await load('/src/data/korean/dictionary.ts')
  const grammar = G.filter(g => g.st === 'ok').map(g => `- ${g.ko} — ${g.ru}`)
  const words = [...new Set(RAW.map(r => r.k))]
  return `// Файл создаёт scripts/chat-curriculum.mjs из данных сайта, руками не править.
/** Пройденные темы грамматики (карточки со статусом «пройдено»). */
export const KNOWN_GRAMMAR = ${JSON.stringify(grammar.join('\n'))}

/** Краткие правила пройденных карточек (для голосового собеседника). */
export const KNOWN_RULES = ${JSON.stringify(rulesOf(G).join('\n'))}

/** Все слова словаря владельца. */
export const KNOWN_WORDS = ${JSON.stringify(words.join(' '))}
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
