/** Настройки сервера: файл backend/.env, переменные окружения и константы. */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Читает backend/.env: строки вида КЛЮЧ=значение, # — комментарий. Уже заданные переменные не трогает. */
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

/** backend/dist/config.js → backend/ */
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnv(path.join(ROOT, '.env'))

export const PORT = Number(process.env.PORT || 3001)
/** Токен владельца: полный доступ. Гостевые токены создаются из кабинета и лежат в базе (хэшами). */
export const TOKEN = process.env.PROGRESS_TOKEN || ''
/** Страница Swagger /api/docs (см. swagger.ts): только для локальной работы. */
export const SWAGGER = process.env.SWAGGER === '1'
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data')

export const BACKUPS = path.join(DATA_DIR, 'backups')
export const UPLOADS = path.join(DATA_DIR, 'uploads')
export const THUMBS = path.join(DATA_DIR, 'thumbs')
export const DOCS = path.join(DATA_DIR, 'docs')
export const PUBLIC_DIR = path.join(DATA_DIR, 'public')
/** Подменённые картинки сайта (режим редактирования) */
export const SITE_DIR = path.join(DATA_DIR, 'site')
export const MAX_SITE_IMAGE = 12 * 1024 * 1024
export const MAX_SITE_IMAGES = 300

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
/** Музыка: без Яндекс.Диска песни лежат здесь; временные файлы загрузки и скачивания по ссылке во второй папке. */
export const MUSIC_DIR = path.join(DATA_DIR, 'music')
export const MUSIC_TMP = path.join(DATA_DIR, 'music-tmp')
/** Одна песня: до 350 МБ (решение владельца 2026-11-14: сборники весят до 330 МБ; то же число в Caddy и на сайте). */
export const MAX_TRACK_MB = 350
export const MAX_TRACK = MAX_TRACK_MB * 1024 * 1024
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

/** Помощник-чат (OpenRouter): ключ только в backend/.env, на сайт он не попадает. Без ключа чат отвечает «не настроен». */
export const CHAT_KEY = process.env.OPENROUTER_API_KEY || ''
/** Модель: бесплатные у OpenRouter оканчиваются на «:free» (список на openrouter.ai/models). */
export const CHAT_MODEL = process.env.CHAT_MODEL || 'openrouter/free'
export const CHAT_BASE = (process.env.CHAT_BASE || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
/** Сколько вопросов в сутки (по UTC) пускать наружу: у бесплатного тарифа 50 запросов в день и 20 в минуту, лишнее не тратим. */
export const CHAT_DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT || 40)
export const CHAT_MAX_TEXT = 2000
export const CHAT_MAX_HISTORY = 12

/** Бесплатные ИИ-помощники голосового окна: Groq (быстрые модели и Whisper) и Gemini. Ключи только в backend/.env; без ключа поставщик в списке не появляется. */
export const GROQ_KEY = process.env.GROQ_API_KEY || ''
export const GROQ_BASE = (process.env.GROQ_BASE || 'https://api.groq.com/openai/v1').replace(/\/+$/, '')
/** Модели Groq: чат `openai/gpt-oss-120b` и распознавание речи `whisper-large-v3-turbo` (список из GET /models с ключом владельца, 2026-11-16: `llama-3.3-70b-versatile` уже снята). */
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
export const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'
export const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
export const GEMINI_BASE = (process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '')
/** Озвучка ответов (Gemini TTS, тот же ключ): родной адрес Gemini (не OpenAI-совместимый), модель и голос по умолчанию. Названия моделей Google меняет: список в GET {GEMINI_NATIVE_BASE}/models с ключом. */
export const GEMINI_NATIVE_BASE = (process.env.GEMINI_NATIVE_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts'
/** Запасные модели озвучки через запятую: у каждой свой бесплатный лимит, при отказе (429, 404, ошибка) пробуется следующая. */
export const GEMINI_TTS_FALLBACK = (process.env.GEMINI_TTS_FALLBACK ?? 'gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview').split(',').map(x => x.trim()).filter(Boolean)
/** Озвучка Edge TTS (Microsoft, без ключа, неофициальный доступ): `EDGE_TTS=0` выключает (в тестах, чтобы не ходить в сеть). */
export const EDGE_ENABLED = process.env.EDGE_TTS !== '0'
export const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore'
/** `gemini-flash-lite-latest` постоянное имя без номера версии (имена вроде `gemini-2.5-flash` Google снимает). Обычная `gemini-flash-latest` 2026-11-16 висела от перегрузки, лёгкая отвечала за 2 секунды. Список: GET {GEMINI_BASE}/models с ключом. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'

/** Голосовой собеседник (OpenAI Realtime): ключ только в .env сервера, в браузер уходит временный ключ. Без ключа окно пишет «не подключён». */
export const VOICE_KEY = process.env.OPENAI_API_KEY || ''
/** Модель: модель gpt-realtime-2.1-mini (выбор владельца, 2026-11-16); цену проверять на странице OpenAI (docs/voice.md). */
export const VOICE_MODEL = process.env.VOICE_MODEL || 'gpt-realtime-2.1-mini'
export const VOICE_VOICE = process.env.VOICE_VOICE || 'marin'
export const VOICE_BASE = (process.env.VOICE_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '')
/** Минут разговора в сутки (решение владельца 2026-11-16: 10) и предел одного разговора. */
export const VOICE_DAILY_MINUTES = Number(process.env.VOICE_DAILY_MINUTES || 20)
export const VOICE_MAX_SESSION_MIN = Number(process.env.VOICE_MAX_SESSION_MIN || 10)
/** Примерная цена минуты, $: только для подсказки на экране, настоящий расход смотреть в кабинете OpenAI. */
export const VOICE_COST_PER_MIN = Number(process.env.VOICE_COST_PER_MIN || 0.05)
/** Часовой пояс, по которому считается «сутки» лимита. */
export const VOICE_TZ = process.env.VOICE_TZ || 'Asia/Novosibirsk'
export const VOICE_MAX_TEXT = 4000
export const VOICE_MAX_MESSAGES = 600
