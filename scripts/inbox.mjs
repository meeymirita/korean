// @ts-check
// Читает «Записанные слова», заметки (GET /api/new-words) и присланные материалы (GET /api/materials) временным токеном: владелец создаёт его кнопкой «Создать токен» в шторке «Новые слова» (10 минут, только чтение).
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

// Присланные материалы (тетради, учебник, задания Леры): тот же токен, GET /api/materials
const mres = await fetch(`${BASE}/api/materials`, { headers: { Authorization: `Bearer ${token}` } })
if (mres.ok) {
  /** @type {{ batches: { id: string; source: string; kind: string; status: string; created: number; items: Record<string, any>[] }[] }} */
  const { batches } = await mres.json()
  const pair = (/** @type {{ ko: string; ru?: string }} */ p) => `${p.ko}${p.ru ? ` — ${p.ru}` : ''}`
  console.log(`\n=== Материалы: ${batches.length} пачек ===`)
  for (const b of batches) {
    console.log(`\n[${b.id}] ${b.source} · ${b.kind} · ${b.status === 'done' ? 'разобрано' : 'новое'} · ${new Date(b.created).toLocaleString('ru-RU')} · элементов ${b.items.length}`)
    for (const it of b.items) {
      if (it.type === 'word') console.log(`  слово: ${it.ko} | ${it.reading} | ${it.ru} | ${it.example}${it.note ? ` | ${it.note}` : ''}`)
      else if (it.type === 'sentence') console.log(`  предложение: ${pair(it)}${it.topic ? ` (${it.topic})` : ''}`)
      else if (it.type === 'dialog') console.log(`  диалог${it.title ? ` «${it.title}»` : ''}: ${it.lines.map(pair).join(' / ')}`)
      else if (it.type === 'text') {
        console.log(`  текст${it.title ? ` «${it.title}»` : ''}: ${it.sentences.map(pair).join(' ')}`)
        for (const q of it.questions) console.log(`    вопрос: ${q.q} → ${q.options.map((o, i) => `${i === q.answer ? '*' : ''}${o}`).join(' | ')}`)
      } else if (it.type === 'grammar') console.log(`  грамматика «${it.title}»: ${it.note}${it.examples.length ? ` · ${it.examples.map(pair).join(' / ')}` : ''}`)
      else if (it.type === 'exercise') console.log(`  задание: ${it.prompt}${it.body ? ` ${it.body}` : ''}${it.answer ? ` → ${it.answer}` : ''}`)
      else console.log(`  заметка: ${it.text}`)
    }
  }
}
