// Сверка слов сайта со словарём 한국어기초사전 (krdict, русские переводы).
// Ключ берётся из .env (KRDICT_KEY), в вывод не попадает.
// Запуск: node scripts/krdict-check.mjs [слово ...]   (без аргументов — все слова из public/words.json)
//         FROM=568 node scripts/krdict-check.mjs      (только слова с номера n)
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
let key = process.env.KRDICT_KEY
for (const f of ['.env', 'backend/.env']) {
  if (key) break
  try { key = readFileSync(root + f, 'utf8').match(/^KRDICT_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') } catch {}
}
if (!key) { console.error('Нет KRDICT_KEY в .env'); process.exit(1) }

const words = JSON.parse(readFileSync(root + 'frontend/public/words.json', 'utf8')).words
const from = Number(process.env.FROM || 0)
const args = process.argv.slice(2)
const list = args.length ? args.map(k => words.find(w => w.ko === k) ?? { ko: k }) : words.filter(w => (w.n ?? 0) >= from)

const tag = (s, t) => [...s.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'g'))].map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim())

async function lookup(q) {
  const url = `https://krdict.korean.go.kr/api/search?key=${key}&q=${encodeURIComponent(q)}&translated=y&trans_lang=10&part=word&num=20`
  let xml
  for (let i = 1; ; i++) {
    try { xml = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).text(); break } catch (e) {
      if (i === 4) throw new Error('сайт krdict не отвечает: ' + (e.cause?.code || e.message))
      await new Promise(r => setTimeout(r, 3000 * i))
    }
  }
  if (/<error_code>/.test(xml)) throw new Error(tag(xml, 'message')[0] || 'ошибка API')
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(m => ({ w: tag(m[1], 'word')[0], pos: tag(m[1], 'pos')[0], tr: tag(m[1], 'trans_word') }))
    .filter(i => i.w === q)
}

let miss = 0
for (const w of list) {
  try {
    const r = await lookup(w.ko)
    if (!r.length) { miss++; console.log(`– ${w.ko}: в словаре krdict нет (${w.ru ?? ''})`); continue }
    console.log(`✓ ${w.ko}: сайт «${w.ru ?? ''}» | krdict: ${r.map(i => i.tr.join('; ')).join(' / ')}`)
  } catch (e) { console.error(`! ${w.ko}: ${e.message}`); break }
  await new Promise(r => setTimeout(r, 300))
}
console.log(`Не найдено: ${miss} из ${list.length}`)
