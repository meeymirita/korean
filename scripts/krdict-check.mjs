// Сверка слов сайта со словарём 한국어기초사전 (krdict, русские переводы). Ничего не исправляет, только отчёт.
// Ключ берётся из .env или backend/.env (KRDICT_KEY), в вывод не попадает.
//   node scripts/krdict-check.mjs                проверить все слова (ответы кэшируются, повтор не тратит запросы)
//   FROM=568 node scripts/krdict-check.mjs       только слова с номера n
//   node scripts/krdict-check.mjs 호주 한류      отдельные слова
// Отчёт: материалы/krdict-отчёт.md (локально, в git не попадает). Кэш: материалы/.krdict-cache.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
let key = process.env.KRDICT_KEY
for (const f of ['.env', 'backend/.env']) {
  if (key) break
  try { key = readFileSync(root + f, 'utf8').match(/^KRDICT_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') } catch {}
}
if (!key) { console.error('Нет KRDICT_KEY в .env или backend/.env'); process.exit(1) }

const words = JSON.parse(readFileSync(root + 'frontend/public/words.json', 'utf8')).words
const from = Number(process.env.FROM || 0)
const args = process.argv.slice(2)
const list = args.length ? args.map(k => words.find(w => w.ko === k) ?? { ko: k, ru: '' }) : words.filter(w => (w.n ?? 0) >= from)

const dir = root + 'материалы/'
mkdirSync(dir, { recursive: true })
const cacheFile = dir + '.krdict-cache.json'
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {}

const tag = (s, t) => [...s.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'g'))].map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim())
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function lookup(q) {
  if (cache[q]) return cache[q]
  const url = `https://krdict.korean.go.kr/api/search?key=${key}&q=${encodeURIComponent(q)}&translated=y&trans_lang=10&part=word&num=100`
  let xml
  for (let i = 1; ; i++) {
    try { xml = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).text(); break } catch (e) {
      if (i === 4) throw new Error('сайт krdict не отвечает: ' + (e.cause?.code || e.message))
      await sleep(3000 * i)
    }
  }
  if (/<error_code>/.test(xml)) {
    const code = tag(xml, 'error_code')[0]
    throw new Error(code === '010' ? 'исчерпан суточный лимит запросов' : `ошибка API ${code}: ${tag(xml, 'message')[0] ?? ''}`)
  }
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
    word: tag(m[1], 'word')[0], pos: tag(m[1], 'pos')[0], grade: tag(m[1], 'word_grade')[0] ?? '',
    pron: tag(m[1], 'pronunciation')[0] ?? '', origin: tag(m[1], 'origin')[0] ?? '', link: tag(m[1], 'link')[0] ?? '',
    senses: [...m[1].matchAll(/<sense>([\s\S]*?)<\/sense>/g)].map(s => ({ def: tag(s[1], 'definition')[0] ?? '', tr: tag(s[1], 'trans_word'), dfn: tag(s[1], 'trans_dfn') })),
  })).filter(i => i.word === q)
  cache[q] = items
  writeFileSync(cacheFile, JSON.stringify(cache))
  await sleep(250)
  return items
}

// есть ли у перевода сайта общая основа слова с каким-то русским переводом krdict (грубо)
const stems = s => (s.toLowerCase().match(/[а-яё]{3,}/g) ?? []).map(w => w.slice(0, Math.min(5, w.length - 1)))
const sameMeaning = (ru, items) => {
  const theirs = items.flatMap(i => i.senses.flatMap(s => [...s.tr, ...s.dfn])).join(' ').toLowerCase()
  return stems(ru).some(st => theirs.includes(st))
}

const rows = { ok: [], review: [], missing: [], noru: [] }
for (const w of list) {
  try {
    const items = await lookup(w.ko)
    if (!items.length) { rows.missing.push(w); console.log(`– ${w.ko}: нет в krdict`); continue }
    const row = { w, items }
    if (!items.some(i => i.senses.some(s => s.tr.length))) rows.noru.push(row)
    else if (sameMeaning(w.ru ?? '', items)) rows.ok.push(row)
    else { rows.review.push(row); console.log(`? ${w.ko}: сайт «${w.ru}» ≠ krdict`) }
  } catch (e) { console.error(`! ${w.ko}: ${e.message}`); break }
}

const fmt = ({ w, items }) => `- **${w.ko}** (${w.reading ?? ''}) сайт: «${w.ru ?? ''}»\n` + items.map(i =>
  `  - ${i.pos}${i.grade ? ', ' + i.grade : ''}${i.pron ? ', произн. [' + i.pron + ']' : ''}${i.origin ? ', ' + i.origin : ''}: ` +
  (i.senses.map(s => s.tr.join('; ')).filter(Boolean).join(' / ') || 'перевода на русский нет') + (i.link ? ` ([статья](${i.link}))` : '')).join('\n')
const md = `# Сверка со словарём krdict (${new Date().toISOString().slice(0, 10)})\n\nПроверено слов: ${list.length}. Совпало по смыслу: ${rows.ok.length}. Посмотреть: ${rows.review.length}. Без русского перевода в krdict: ${rows.noru.length}. Нет в krdict: ${rows.missing.length}.\n\nСравнение грубое (общая основа слова), «посмотреть» не значит «ошибка».\n\n## Посмотреть (перевод не совпал)\n${rows.review.map(fmt).join('\n') || 'нет'}\n\n## Нет русского перевода в krdict\n${rows.noru.map(r => `- ${r.w.ko}: «${r.w.ru}»`).join('\n') || 'нет'}\n\n## Нет в krdict\n${rows.missing.map(w => `- ${w.ko}: «${w.ru}»`).join('\n') || 'нет'}\n\n## Совпало\n${rows.ok.map(r => `- ${r.w.ko}: «${r.w.ru}»`).join('\n')}\n`
writeFileSync(dir + 'krdict-отчёт.md', md)
console.log(`Готово: совпало ${rows.ok.length}, посмотреть ${rows.review.length}, без русского ${rows.noru.length}, нет в krdict ${rows.missing.length}. Отчёт: материалы/krdict-отчёт.md`)
