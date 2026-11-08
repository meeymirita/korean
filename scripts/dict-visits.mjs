// Показывает, кто ходил на большой словарь и подборки: люди и роботы поисковиков, по дням, самые частые страницы, откуда пришли.
//   TOKEN=<токен владельца> BASE=https://korean.meeymirita.ru node scripts/dict-visits.mjs [дней=30]
// Токен можно не передавать, если в backend/.env есть PROGRESS_TOKEN (локальный и боевой совпадают). Токен не печатается.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = (process.env.BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')
const days = Number(process.argv[2]) || 30
let token = process.env.TOKEN || ''
if (!token) {
  try {
    token = /^PROGRESS_TOKEN=(.*)$/m.exec(readFileSync(fileURLToPath(new URL('../backend/.env', import.meta.url)), 'utf8'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
  } catch { /* файла нет */ }
}
if (!token) { console.error('Нет токена: передай TOKEN=… или положи PROGRESS_TOKEN в backend/.env'); process.exit(1) }

const res = await fetch(`${BASE}/api/dict/visits?days=${days}`, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) { console.error(res.status === 401 ? 'Токен не подошёл' : `Ошибка ${res.status}`); process.exit(1) }
const s = await res.json()
const KIND = { dict: 'главная словаря', word: 'слово', set: 'подборка', sets: 'список подборок' }
console.log(`За ${s.days} дн. (с ${s.since}): людей ${s.human}, роботов ${s.bots}`)
console.log(s.anyHuman ? `Последний человек: ${new Date(s.lastHuman).toLocaleString('ru-RU')}` : 'Людей за период не было')
if (s.byBot.length) console.log('\nРоботы:', s.byBot.map(b => `${b.who} ${b.n}`).join(', '))
if (s.sources.length) console.log('Откуда приходят люди:', s.sources.map(b => `${b.src} ${b.n}`).join(', '))
if (s.top.length) console.log('\nСтраницы, на которые ходили люди:\n' + s.top.map(t => `  ${String(t.n).padStart(4)}  ${KIND[t.kind] ?? t.kind}: ${t.ref}`).join('\n'))
if (s.byDay.length) console.log('\nПо дням (люди / роботы):\n' + s.byDay.map(d => `  ${d.day}  ${String(d.human).padStart(4)} / ${d.bots}`).join('\n'))
