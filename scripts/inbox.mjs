// @ts-check
// Читает «Записанные слова» и заметки (GET /api/new-words) временным токеном: владелец создаёт его кнопкой «Создать токен» в шторке «Новые слова» (10 минут, только чтение).
// INBOX_TOKEN=<токен из шторки> BASE=https://korean.meeymirita.ru node scripts/inbox.mjs   (BASE по умолчанию локальный сервер)
// Каждое слово сверяется с большим словарём сайта (GET /api/dict/word/<слово>: 한국어기초사전, открытый адрес того же сервера): рядом перевод владельца и словарный.
// Наружу запросов нет. Без сверки: NO_DICT=1.
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

/**
 * Словарные статьи слова из большого словаря: перевод, часть речи, уровень, произношение.
 * @param {string} ko
 * @returns {Promise<string[]>} строки для печати; пусто, если сверка выключена
 */
async function dictLines(ko) {
  if (process.env.NO_DICT === '1' || !ko) return []
  try {
    const r = await fetch(`${BASE}/api/dict/word/${encodeURIComponent(ko.trim())}`, { signal: AbortSignal.timeout(15_000) })
    if (r.status === 404) return ['  в словаре: такого слова нет (проверь написание или форму: в словаре глаголы стоят на 다)']
    if (!r.ok) return [`  в словаре: ошибка ${r.status}`]
    /** @type {{ entries?: { ru?: string; pos?: string; level?: string; pron?: string; hom?: number }[] }} */
    const data = await r.json()
    const entries = data.entries ?? []
    if (!entries.length) return ['  в словаре: такого слова нет (проверь написание или форму: в словаре глаголы стоят на 다)']
    return entries.map((e, i) => `  в словаре${entries.length > 1 ? ` (${i + 1})` : ''}: ${e.ru || '—'} · ${[e.pos, e.level, e.pron ? `[${e.pron}]` : ''].filter(Boolean).join(', ')}`)
  } catch {
    return ['  в словаре: сверить не удалось (словарь не ответил)']
  }
}

/** @type {{ words: { id: number; created: number; ko?: string; reading?: string; ru?: string; example?: string; note?: string }[] }} */
const { words } = await res.json()
console.log(`Записей: ${words.length}`)
for (const w of words) {
  console.log(`\n#${w.id} · ${new Date(w.created).toLocaleString('ru-RU')}`)
  if (w.ko || w.ru) {
    console.log(`${w.ko} | ${w.reading} | ${w.ru} | ${w.example}`)
    for (const line of await dictLines(w.ko ?? '')) console.log(line)
  }
  if (w.note) console.log(`Заметка: ${w.note}`)
}
