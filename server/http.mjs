/** Мелкие помощники для HTTP: ответ JSON, чтение тела с лимитом, токен из заголовка. */
import { MAX_BODY } from './config.mjs'

export const send = (res, status, body, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
  res.end(JSON.stringify(body))
}

export const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '')

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooBig = false
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) tooBig = true // остаток читаем и выбрасываем, чтобы ответить 413
      else chunks.push(c)
    })
    req.on('end', () => (tooBig ? reject(Object.assign(new Error('too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8'))))
    req.on('error', reject)
  })
}
