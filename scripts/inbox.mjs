// Читает «Не добавленные» слова и заметки (GET /api/new-words) токеном входящих INBOX_TOKEN: только чтение, токен не печатается.
// BASE=https://korean.meeymirita.ru node scripts/inbox.mjs   (токен из переменной INBOX_TOKEN или из backend/.env)
import { readFileSync } from 'node:fs'
const BASE = (process.env.BASE || 'http://127.0.0.1:3001').replace(/\/$/, '')
let token = process.env.INBOX_TOKEN || ''
if (!token) {
  try { token = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8').match(/^INBOX_TOKEN=(.*)$/m)?.[1].trim() || '' } catch {}
}
if (!token) { console.error('Нет INBOX_TOKEN (переменная окружения или backend/.env)'); process.exit(1) }
const res = await fetch(`${BASE}/api/new-words`, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) { console.error(`Ошибка ${res.status}`); process.exit(1) }
const { words } = await res.json()
console.log(`Записей: ${words.length}`)
for (const w of words) {
  console.log(`\n#${w.id} · ${new Date(w.created).toLocaleString('ru-RU')}`)
  if (w.ko || w.ru) console.log(`${w.ko} | ${w.reading} | ${w.ru} | ${w.example}`)
  if (w.note) console.log(`Заметка: ${w.note}`)
}
