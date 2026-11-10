// Открытые списки для чтения: пройденная грамматика и все предложения сайта с переводом.
// Пишет backend/src/public/study.data.ts, его отдают GET /api/public/grammar и GET /api/public/sentences.
// Только учебные данные: никаких токенов, прогресса и данных пользователей. Запуск: node scripts/build-study-data.mjs
// (после изменения грамматики, статуса карточки, словаря, переводов, рассказов или диалогов). Тест tests/study-data.test.mjs следит, что файл не отстал.
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'

export const OUT = fileURLToPath(new URL('../backend/src/public/study.data.ts', import.meta.url))

/** Убирает разметку карточек: {o|이에요} → 이에요, **жирный** → жирный, теги и переносы → пробел. */
export const plain = s =>
  String(s)
    .replace(/\{[a-z]\|([^}]*)\}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const block = b => {
  if (b[0] === 'ex') return { type: 'examples', examples: b[1].map(([ko, ru]) => ({ ko: plain(ko), ru: plain(ru) })) }
  if (b[0] === 'tbl') return { type: 'table', head: b[1].map(plain), rows: b[2].map(r => r.map(plain)) }
  return { type: { p: 'text', h: 'heading', rule: 'rule', formula: 'formula', warn: 'warning', tip: 'tip', ok: 'correct', pron: 'pronunciation' }[b[0]], text: plain(b[1]) }
}

/** Пройденные карточки грамматики (статус «пройдено») и все предложения сайта с переводом, без повторов. */
export async function data() {
  const { G } = await load('/src/data/korean/grammar.ts')
  const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
  const { STORIES, RULE_SENTENCES } = await load('/src/game/stories.ts')
  const { EXCHANGES } = await load('/src/game/dialogs.ts')
  const grammar = G.filter(g => g.st === 'ok').map(g => ({
    id: g.id,
    ko: plain(g.ko),
    ru: plain(g.ru),
    section: g.s,
    lesson: g.l ?? '',
    about: plain(g.d),
    blocks: g.b.map(block),
  }))
  const all = new Map(Object.entries(TRANSLATIONS))
  for (const st of STORIES) for (const x of st.sents) all.set(x.ko, x.ru)
  for (const e of EXCHANGES) all.set(e[0], e[1]).set(e[2], e[3])
  for (const x of RULE_SENTENCES) all.set(x.ko, x.ru)
  const sentences = [...all].map(([ko, ru]) => ({ ko, ru }))
  return { grammar, sentences }
}

const lines = (name, rows) => `{"count": ${rows.length}, "${name}": [\n${rows.map(r => JSON.stringify(r)).join(',\n')}\n]}\n`

/** Текст файла study.data.ts по текущим данным сайта (без даты, чтобы файл не менялся без причины). */
export async function build() {
  const { grammar, sentences } = await data()
  return `// Файл создаёт scripts/build-study-data.mjs из данных сайта, руками не править.
/** Готовый ответ GET /api/public/grammar: пройденные карточки грамматики. */
export const STUDY_GRAMMAR = ${JSON.stringify(lines('grammar', grammar))}

/** Готовый ответ GET /api/public/sentences: все предложения сайта с переводом. */
export const STUDY_SENTENCES = ${JSON.stringify(lines('sentences', sentences))}
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, await build())
  close()
  console.log('записано:', OUT)
}
