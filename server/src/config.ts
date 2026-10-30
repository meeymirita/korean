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
export const DOCS = path.join(DATA_DIR, 'docs')
export const PUBLIC_DIR = path.join(DATA_DIR, 'public')

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

/** Картинки: до 50 МБ каждая, всего до 1 ГБ. */
export const MAX_IMAGE = 50 * 1024 * 1024
/** IMAGES_QUOTA_MB нужна только тестам, чтобы не заливать полгигабайта. */
export const MAX_IMAGES_TOTAL = Number(process.env.IMAGES_QUOTA_MB || 1024) * 1024 * 1024
export const MAX_CAPTION = 200
export const MAX_DESCRIPTION = 1000
/** Картинок в одной заметке. */
export const MAX_NOTE_IMAGES = 10

export const MAX_EVENTS = 2000

/** Записи календаря: до 2000, в каждой до 20 файлов (PDF, Word, картинки) по 25 МБ, всего до 1 ГБ. */
export const MAX_PLANS = 2000
export const MAX_PLAN_TITLE = 100
export const MAX_PLAN_TEXT = 5000
export const MAX_PLAN_FILES = 20
export const MAX_DOC = 25 * 1024 * 1024
export const MAX_DOCS_TOTAL = Number(process.env.DOCS_QUOTA_MB || 1024) * 1024 * 1024

/** Сохранённые наборы «Сегодня»: до 500, снимок не больше 200 тысяч знаков. */
export const MAX_SETS = 500
export const MAX_SET_DATA = 200_000

/** Публичная визитка: картинка для превью ссылки (1200×630) не тяжелее 1 МБ. */
export const MAX_OG = 1024 * 1024
