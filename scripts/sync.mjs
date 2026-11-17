// Единая команда «обнови всё, что строится из данных сайта»: словарь, грамматика, переводы, режимы и тёмная тема лежат в frontend/src,
// а всё производное (пул писем, words.json, инструкции чата и голоса, данные для чтения по API, названия режимов, night.css, числа в README и docs)
// собирается отсюда. Одна команда вместо восьми скриптов по памяти.
//
//   npm run sync               обновить всё, что отстало
//   npm run sync:check         ничего не писать; код выхода 1 и список отставшего (то же проверяет tests/sync.test.mjs)
//   node scripts/sync.mjs --list   что сейчас считается пройденным и непройденным
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { close, load } from '../tests/_load.mjs'
import { buildNight } from './build-night.mjs'

const here = p => fileURLToPath(new URL(p, import.meta.url))

/** Скрипты с `OUT` и `build()`: каждый возвращает полный текст своего файла. Новый такой скрипт допиши сюда (тест `tests/sync.test.mjs` напомнит). */
export const GENERATORS = ['digest-pool', 'words-export-vocab', 'build-words-json', 'chat-curriculum', 'build-study-data', 'build-mode-names']

/** Числа в текстах, которые раньше правили руками: слов и правил грамматики. */
export const COUNTERS = [
  { file: 'README.md', re: /\*\*\d+ слов\*\*/, make: n => `**${n.words} слов**` },
  { file: 'README.md', re: /\*\*\d+ правил грамматики\*\*/, make: n => `**${n.rules} правил грамматики**` },
  { file: 'docs/data.md', re: /Сейчас \d+ слов \(/, make: n => `Сейчас ${n.words} слов (` },
]

/** Подставляет числа в текст файла; если места для числа нет, бросает ошибку (кто-то переписал фразу: поправь COUNTERS). */
export function applyCounters(text, file, n) {
  let out = text
  for (const c of COUNTERS.filter(x => x.file === file)) {
    if (!c.re.test(out)) throw new Error(`${file}: нет места для числа ${c.re}`)
    out = out.replace(c.re, c.make(n))
  }
  return out
}

/** Все файлы, которые sync ведёт: путь, имя, как должен выглядеть текст сейчас. */
export async function targets() {
  const out = []
  for (const name of GENERATORS) {
    const m = await import(`./${name}.mjs`)
    out.push({ name, path: m.OUT, content: await m.build() })
  }
  out.push({ name: 'build-night', path: here('../frontend/src/assets/night.css'), content: buildNight(readFileSync(here('../frontend/src/assets/dark.css'), 'utf8')) })
  const { D } = await load('/src/data/korean/words.ts')
  const { G } = await load('/src/data/korean/grammar.ts')
  const n = { words: D.length, rules: G.length }
  for (const file of new Set(COUNTERS.map(c => c.file))) {
    const path = here('../' + file)
    out.push({ name: `числа в ${file}`, path, content: applyCounters(readFileSync(path, 'utf8'), file, n) })
  }
  return out
}

/** Что отстало: [{ name, path, content }]. */
export async function stale() {
  return (await targets()).filter(t => readFileSync(t.path, 'utf8') !== t.content)
}

async function list() {
  const { G } = await load('/src/data/korean/grammar.ts')
  const { NOT_YET } = await load('/src/data/korean/notyet.ts')
  const ok = G.filter(g => g.st === 'ok')
  console.log(`Пройдено (карточки st: 'ok', ${ok.length} из ${G.length}):\n${ok.map(g => `  ${g.ko} — ${g.ru}`).join('\n')}`)
  console.log(`\nЕщё не пройдено без своей карточки (frontend/src/data/korean/notyet.ts, ${NOT_YET.length}):\n${NOT_YET.map(n => `  ${n.label}`).join('\n')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--list')) await list()
    else {
      const old = await stale()
      if (process.argv.includes('--check')) {
        if (old.length) {
          console.error(`Отстало (${old.length}): ${old.map(t => t.name).join(', ')}.\nЗапусти: npm run sync`)
          process.exitCode = 1
        } else console.log('Всё свежее: производные файлы совпадают с данными сайта.')
      } else {
        for (const t of old) writeFileSync(t.path, t.content)
        console.log(old.length ? `Обновлено (${old.length}): ${old.map(t => t.name).join(', ')}` : 'Всё уже свежее, менять нечего.')
      }
    }
  } finally {
    await close()
  }
}
