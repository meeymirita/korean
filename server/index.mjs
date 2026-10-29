/**
 * Маленький сервер для прогресса: хранит один JSON-файл и копии по дням. Без зависимостей, нужен только Node.
 * Токен (пароль) берётся из файла server/.env:  PROGRESS_TOKEN=секрет
 * Запуск: npm run server. Переменные окружения (PROGRESS_TOKEN, PORT, DATA_DIR) главнее файла.
 * Слушает только 127.0.0.1: наружу его выставляет Caddy (reverse_proxy /api/* → порт сервера).
 *
 * Модули: config (настройки), http (ответы и тело запроса), storage (запись и копии), guests (гостевые токены),
 * notes (заметки владельца).
 */
import http from 'node:http'
import { DATA_DIR, PORT, TOKEN } from './config.mjs'
import { guestsApi, roleHeaders, whoIs } from './guests.mjs'
import { readBody, send } from './http.mjs'
import { notesApi } from './notes.mjs'
import { readProgress, saveProgress } from './storage.mjs'

if (!TOKEN) {
  console.error('Не задан PROGRESS_TOKEN. Создай файл server/.env со строкой PROGRESS_TOKEN=придумай-секрет (образец: server/.env.example).')
  process.exit(1)
}

/** GET и PUT /api/progress: владелец читает и пишет свой прогресс; гость получает пустой и ничего не записывает. */
async function progressApi(req, res, who) {
  const hdr = roleHeaders(who)

  if (req.method === 'GET') return send(res, 200, who.role === 'guest' ? {} : await readProgress(), hdr)

  if (req.method === 'PUT') {
    let data
    try {
      data = JSON.parse(await readBody(req))
    } catch (e) {
      return send(res, e.status || 400, { error: e.status === 413 ? 'too large' : 'invalid json' })
    }
    if (!data || typeof data !== 'object' || data.v !== 1) return send(res, 400, { error: 'invalid progress' })
    if (who.role === 'guest') return send(res, 200, { ok: true, guest: true }, hdr)
    await saveProgress(data)
    return send(res, 200, { ok: true, updated: data.updated ?? null }, hdr)
  }

  return send(res, 405, { error: 'method not allowed' })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/api/health') return send(res, 200, { ok: true })
    const isGuests = url.pathname === '/api/guests' || url.pathname.startsWith('/api/guests/')
    const isNotes = url.pathname === '/api/notes'
    if (url.pathname !== '/api/progress' && !isGuests && !isNotes) return send(res, 404, { error: 'not found' })

    const who = whoIs(req)
    if (!who) return send(res, 401, { error: 'unauthorized' })
    if (who.expired) return send(res, 401, { error: 'expired' })

    if (isNotes) return notesApi(req, res, who)
    return isGuests ? guestsApi(req, res, url, who) : progressApi(req, res, who)
  } catch (e) {
    console.error(e)
    return send(res, 500, { error: 'server error' })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`Прогресс: http://127.0.0.1:${PORT}/api/progress, данные в ${DATA_DIR}`))
