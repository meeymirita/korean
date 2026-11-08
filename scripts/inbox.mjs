// Читает «Записанные слова» и заметки (GET /api/new-words) временным токеном: владелец создаёт его кнопкой «Создать токен» в шторке «Новые слова» (10 минут, только чтение).
// INBOX_TOKEN=<токен из шторки> BASE=https://korean.meeymirita.ru node scripts/inbox.mjs   (BASE по умолчанию локальный сервер)
const BASE = (process.env.BASE || 'http://127.0.0.1:3001').replace(/\/$/, '')
const token = process.env.INBOX_TOKEN || ''
if (!token) {
  console.error('Нет INBOX_TOKEN: создай токен кнопкой в шторке «Новые слова» и передай его переменной окружения')
  process.exit(1)
}
const res = await fetch(`${BASE}/api/new-words`, { headers: { Authorization: `Bearer ${token}` } })
if (!res.ok) {
  console.error(res.status === 401 ? 'Токен не подошёл или его срок (10 минут) вышел: создай новый' : `Ошибка ${res.status}`)
  process.exit(1)
}
const { words } = await res.json()
console.log(`Записей: ${words.length}`)
for (const w of words) {
  console.log(`\n#${w.id} · ${new Date(w.created).toLocaleString('ru-RU')}`)
  if (w.ko || w.ru) console.log(`${w.ko} | ${w.reading} | ${w.ru} | ${w.example}`)
  if (w.note) console.log(`Заметка: ${w.note}`)
}
