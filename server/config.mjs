/** Настройки сервера: файл server/.env, переменные окружения и константы. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Читает server/.env: строки вида КЛЮЧ=значение, # — комментарий. Уже заданные переменные не трогает. */
function loadEnv(file) {
  let text
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
loadEnv(path.join(HERE, '.env'))

export const PORT = Number(process.env.PORT || 3001)
/** Токен владельца: полный доступ, в том числе к гостевым токенам. */
export const TOKEN = process.env.PROGRESS_TOKEN || ''
export const DATA_DIR = process.env.DATA_DIR || path.join(HERE, 'data')

export const FILE = path.join(DATA_DIR, 'progress.json')
export const BACKUPS = path.join(DATA_DIR, 'backups')
export const GUESTS_FILE = path.join(DATA_DIR, 'guests.json')
export const NOTES_FILE = path.join(DATA_DIR, 'notes.json')

export const KEEP_BACKUPS = 30
export const MAX_BODY = 1024 * 1024
/** 200 заметок по 5000 символов на кириллице (2 байта на букву) занимают около 2 МБ. */
export const MAX_NOTES_BODY = 4 * 1024 * 1024
export const MAX_NOTES = 200
export const MAX_NOTE_TITLE = 100
export const MAX_NOTE_TEXT = 5000
export const MAX_GUESTS = 30
export const MAX_GUEST_HOURS = 720
/** Просроченную запись держим сутки: чтобы гость увидел «срок вышел», а не «неверный токен». */
export const EXPIRED_KEEP = 24 * 3600 * 1000
