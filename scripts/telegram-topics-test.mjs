// Проверка тем Telegram-группы: в каждую тему уходит одно сообщение с названием темы (баннер, если он уже есть на сайте).
// Запуск на сервере: node scripts/telegram-topics-test.mjs  (токен и номера тем читаются из .env, на экран не выводятся)
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const names = { login: 'Вход', remind: 'Напоминания', digest: 'Подборка слов', lesson: 'Созвон', backup: 'Копии', alert: 'Тревоги' }
const base = (env.TELEGRAM_BANNER_BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')

if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_GROUP_ID) {
  console.log('Нет TELEGRAM_BOT_TOKEN или TELEGRAM_GROUP_ID в .env')
  process.exit(1)
}
async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const r = await res.json().catch(() => ({}))
  return { ok: !!r.ok, why: r.description }
}
for (const [key, name] of Object.entries(names)) {
  const thread = Number(env[`TELEGRAM_TOPIC_${key.toUpperCase()}`])
  if (!thread) {
    console.log(`${name}: номер темы не задан (TELEGRAM_TOPIC_${key.toUpperCase()})`)
    continue
  }
  const to = { chat_id: env.TELEGRAM_GROUP_ID, message_thread_id: thread }
  const caption = `✳︎ <b>우리말</b>\nТема: <b>${name}</b>`
  let r = await call('sendPhoto', { ...to, photo: `${base}/tg/tg-${key}.png`, caption, parse_mode: 'HTML' })
  let how = 'с баннером'
  if (!r.ok) {
    r = await call('sendMessage', { ...to, text: caption + '\n<i>(баннера на сайте ещё нет)</i>', parse_mode: 'HTML' })
    how = 'текстом, без баннера'
  }
  console.log(`${name} (${thread}): ${r.ok ? 'отправлено ' + how : 'ОШИБКА ' + r.why}`)
}
