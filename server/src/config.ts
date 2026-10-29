/** Настройки сервера: файл server/.env, переменные окружения и константы. */
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Читает server/.env: строки вида КЛЮЧ=значение, # — комментарий. Уже заданные переменные не трогает. */
function loadEnv(file: string) {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}

/** server/dist/config.js → server/ */
export const ROOT = path.join(__dirname, '..')
loadEnv(path.join(ROOT, '.env'))

export const PORT = Number(process.env.PORT || 3001)
/** Токен владельца: полный доступ. Гостевые токены создаются из кабинета и лежат в базе (хэшами). */
export const TOKEN = process.env.PROGRESS_TOKEN || ''
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')

export const DB_FILE = path.join(DATA_DIR, 'app.db')
export const BACKUPS = path.join(DATA_DIR, 'backups')
export const UPLOADS = path.join(DATA_DIR, 'uploads')
export const THUMBS = path.join(DATA_DIR, 'thumbs')

export const KEEP_BACKUPS = 30
/** Тела запросов (JSON): заметки до 200 × 5000 символов на кириллице занимают около 2 МБ. */
export const MAX_JSON = '4mb'

export const MAX_GUESTS = 30
export const MAX_GUEST_HOURS = 720
/** Просроченную запись гостя держим сутки: чтобы показать «срок вышел», а не «неверный токен». */
export const EXPIRED_KEEP = 24 * 3600 * 1000

export const MAX_NOTES = 200
export const MAX_NOTE_TITLE = 100
export const MAX_NOTE_TEXT = 5000

/** Картинки: до 50 МБ каждая, всего до 500 МБ. */
export const MAX_IMAGE = 50 * 1024 * 1024
export const MAX_IMAGES_TOTAL = 500 * 1024 * 1024
export const MAX_CAPTION = 200

export const MAX_EVENTS = 2000
