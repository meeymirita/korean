/**
 * Маленький сервер для прогресса: хранит один JSON-файл и копии по дням. Без зависимостей, нужен только Node.
 * Токен (пароль) берётся из файла server/.env:  PROGRESS_TOKEN=секрет
 * Запуск: npm run server. Переменные окружения (PROGRESS_TOKEN, PORT, DATA_DIR) главнее файла.
 * Слушает только 127.0.0.1: наружу его выставляет Caddy (reverse_proxy /api/* → порт сервера).
 *
 * Модули: config (настройки), http (ответы и тело запроса), storage (запись и копии).
 */
import { timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { DATA_DIR, PORT, TOKEN } from './config.mjs'
import { bearer, readBody, send } from './http.mjs'
import { readProgress, saveProgress } from './storage.mjs'

if (!TOKEN) {
  console.error('Не задан PROGRESS_TOKEN. Создай файл server/.env со строкой PROGRESS_TOKEN=придумай-секрет (образец: server/.env.example).')
  process.exit(1)
}

const authorized = req => {
  const given = Buffer.from(bearer(req))
  const want = Buffer.from(TOKEN)
  return given.length === want.length && timingSafeEqual(given, want)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/api/health') return send(res, 200, { ok: true })
    if (url.pathname !== '/api/progress') return send(res, 404, { error: 'not found' })
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' })

    if (req.method === 'GET') return send(res, 200, await readProgress())

    if (req.method === 'PUT') {
      let data
      try {
        data = JSON.parse(await readBody(req))
      } catch (e) {
        return send(res, e.status || 400, { error: e.status === 413 ? 'too large' : 'invalid json' })
      }
      if (!data || typeof data !== 'object' || data.v !== 1) return send(res, 400, { error: 'invalid progress' })
      await saveProgress(data)
      return send(res, 200, { ok: true, updated: data.updated ?? null })
    }

    return send(res, 405, { error: 'method not allowed' })
  } catch (e) {
    console.error(e)
    return send(res, 500, { error: 'server error' })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`Прогресс: http://127.0.0.1:${PORT}/api/progress, данные в ${DATA_DIR}`))
