// Очистка Telegram-группы: удаляет ВСЕ сообщения во всех темах (и в «General»), сами темы остаются и номера не меняются.
// Нужен бот-администратор с правом «Удаление сообщений». Закреплённые описания тем тоже исчезнут: их потом можно написать заново.
// Запуск на сервере: node scripts/telegram-clear-group.mjs --yes   (без --yes только объясняет, что сделает)
// Токен и номер группы читаются из .env, на экран не выводятся.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_GROUP_ID) {
  console.log('Нет TELEGRAM_BOT_TOKEN или TELEGRAM_GROUP_ID в .env')
  process.exit(1)
}
if (!process.argv.includes('--yes')) {
  console.log('Скрипт удалит ВСЕ сообщения группы во всех темах, включая закреплённые описания. Темы останутся.')
  console.log('Если уверены: node scripts/telegram-clear-group.mjs --yes')
  process.exit(0)
}

const chat_id = env.TELEGRAM_GROUP_ID
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const r = await res.json().catch(() => ({}))
  return { ok: !!r.ok, why: r.description, result: r.result }
}

// Номера сообщений общие для всей группы и растут по порядку: отправляем одно служебное и берём его номер как верхнюю границу.
const probe = await call('sendMessage', { chat_id, text: '.' })
if (!probe.ok) {
  console.log('Не вышло отправить служебное сообщение:', probe.why)
  process.exit(1)
}
const last = probe.result.message_id
console.log(`Последний номер сообщения: ${last}. Удаляю…`)

let removed = 0
for (let from = 1; from <= last; from += 100) {
  const ids = Array.from({ length: Math.min(100, last - from + 1) }, (_, i) => from + i)
  const r = await call('deleteMessages', { chat_id, message_ids: ids })
  if (!r.ok) {
    // пачка не прошла (например, в ней служебное сообщение о создании темы): удаляем по одному, что получится
    for (const id of ids) {
      const one = await call('deleteMessage', { chat_id, message_id: id })
      if (one.ok) removed++
      await sleep(40)
    }
  } else removed += ids.length
  await sleep(300)
}
console.log(`Готово. Попытка удаления по номерам 1…${last} выполнена, удалено примерно ${removed} (служебные сообщения о создании тем Telegram не удаляет).`)
