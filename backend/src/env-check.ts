/**
 * Реестр переменных окружения сервера и проверка их значений при запуске.
 * Сами переменные по-прежнему читаются на месте (`process.env.ИМЯ`, часть читается в момент вызова, и тесты меняют их на лету);
 * здесь только список «что бывает и в каком виде» и предупреждения в журнал при старте: время не `ЧЧ:ММ`, день недели не 0–6,
 * адрес не адрес, число не число, Telegram настроен наполовину, опечатка в имени. Сервер из-за этого не останавливается.
 * Новая переменная в коде: допиши её сюда (тест `tests/env-registry.test.mjs` сверяет реестр с кодом и с `.env.example`).
 */

export type EnvKind = 'string' | 'secret' | 'flag' | 'int' | 'num' | 'port' | 'url' | 'time' | 'weekday' | 'path'

/** Имя → вид значения. Пустое значение считается «не задано» и не проверяется. */
export const ENV_VARS: Record<string, EnvKind> = {
  // сервер
  PORT: 'port', HOST: 'string', DATA_DIR: 'path', PROGRESS_TOKEN: 'secret', SWAGGER: 'flag', TRUST_PROXY: 'string',
  NODE_ENV: 'string', VITEST: 'string', TZ: 'string', OWNER_SESSION_HOURS: 'num', DISABLE_2FA: 'flag', SITE_URL: 'url',
  RATE_LIMIT_PER_MIN: 'int', RATE_HEAVY_PER_MIN: 'int', RATE_BAD_LIMIT: 'int', RATE_LOCK_MIN: 'int',
  // база и поиск
  DATABASE_URL: 'url', REDIS_URL: 'url', MEILISEARCH_URL: 'url', MEILISEARCH_MASTER_KEY: 'secret', DICT_FILE: 'path',
  PG_DUMP_BIN: 'path', PG_DUMP_DATABASE_URL: 'url', PG_DUMP_SCHEMA: 'string',
  // лимиты места
  IMAGES_QUOTA_MB: 'num', DOCS_QUOTA_MB: 'num',
  // помощник-чат
  OPENROUTER_API_KEY: 'secret', CHAT_MODEL: 'string', CHAT_BASE: 'url', CHAT_DAILY_LIMIT: 'int',
  // почта
  SMTP_HOST: 'string', SMTP_PORT: 'port', SMTP_USER: 'string', SMTP_PASS: 'secret', SMTP_FROM: 'string', MAIL_DUMP_FILE: 'path',
  // Telegram
  TELEGRAM_BOT_TOKEN: 'secret', TELEGRAM_CHAT_ID: 'string', TELEGRAM_GROUP_ID: 'string', TELEGRAM_BANNER_BASE: 'url',
  TELEGRAM_CUSTOM_EMOJI: 'string', TELEGRAM_DUMP_FILE: 'path',
  // напоминания, письма, отчёты
  REMINDER_MAIL_TO: 'string', CODE_LOGIN: 'flag', REMINDER_TICK_MS: 'int', LESSON_TICK_MS: 'int',
  REPORT_WEEKLY: 'flag', REPORT_WEEKDAY: 'weekday', REPORT_TIME: 'time', REPORT_WATCH_MS: 'int',
  STUDY_WEEKLY: 'flag', STUDY_WEEKDAY: 'weekday', STUDY_TIME: 'time',
  // копии
  BACKUP_DIR: 'path', BACKUP_AUTO: 'flag', BACKUP_EVERY_DAYS: 'int', BACKUP_MAIL_TO: 'string', BACKUP_PASSPHRASE: 'secret', BACKUP_WATCH_MS: 'int',
  YADISK_TOKEN: 'secret', YADISK_ROOT: 'string', YADISK_KEEP: 'int', YADISK_SYNC_DELAY_MS: 'int', YADISK_DUMP_DIR: 'path', YTDLP_BIN: 'path', YTDLP_COOKIES: 'path',
  // Docker и мониторинг
  DOCKER_API_URL: 'url', COMPOSE_PROJECT_NAME: 'string', PROMETHEUS_URL: 'url',
}

/** Переменные с общим началом (номера тем Telegram: TELEGRAM_TOPIC_LOGIN, …): проверяются как целые. */
export const ENV_PREFIXES: Record<string, EnvKind> = { TELEGRAM_TOPIC_: 'int' }

/** Начала имён, в которых опечатку можно поймать: чужие переменные (Docker, система) не трогаем. */
const WATCHED = ['TELEGRAM_', 'YADISK_', 'SMTP_', 'REPORT_', 'STUDY_', 'BACKUP_', 'CHAT_', 'REMINDER_', 'MEILISEARCH_', 'RATE_', 'PG_DUMP_']

const kindOf = (name: string): EnvKind | undefined =>
  ENV_VARS[name] ?? Object.entries(ENV_PREFIXES).find(([p]) => name.startsWith(p))?.[1]

/** Возвращает описание проблемы значения или пустую строку, если всё в порядке. */
export function problemWith(kind: EnvKind, value: string): string {
  const v = value.trim()
  switch (kind) {
    case 'time': {
      const m = /^(\d{1,2}):(\d{2})$/.exec(v)
      return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? '' : 'нужно время вида ЧЧ:ММ (например 20:00)'
    }
    case 'weekday':
      return /^[0-6]$/.test(v) ? '' : 'нужен день недели числом 0–6 (0 — воскресенье)'
    case 'port':
      return Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 65535 ? '' : 'нужен порт от 1 до 65535'
    case 'int':
      return /^\d+$/.test(v) ? '' : 'нужно целое число'
    case 'num':
      return Number.isFinite(Number(v)) && Number(v) >= 0 ? '' : 'нужно число'
    case 'flag':
      return v === '0' || v === '1' ? '' : 'нужно 0 или 1'
    case 'url':
      try {
        new URL(v)
        return ''
      } catch {
        return 'нужен адрес вида https://…'
      }
    default:
      return ''
  }
}

/** Все замечания к окружению: формат значений, Telegram наполовину, неизвестные имена. Пусто — всё хорошо. */
export function checkEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value === '') continue
    const kind = kindOf(name)
    if (!kind) {
      if (WATCHED.some(p => name.startsWith(p))) out.push(`${name}: такой переменной сервер не знает (опечатка?)`)
      continue
    }
    const why = problemWith(kind, value)
    if (why) out.push(`${name}: ${why}`)
  }
  const set = (n: string) => !!env[n]
  if (set('TELEGRAM_BOT_TOKEN') && !set('TELEGRAM_CHAT_ID') && !set('TELEGRAM_GROUP_ID')) out.push('TELEGRAM_BOT_TOKEN задан, а ни TELEGRAM_CHAT_ID, ни TELEGRAM_GROUP_ID нет: сообщения некуда слать')
  if (!set('TELEGRAM_BOT_TOKEN') && (set('TELEGRAM_CHAT_ID') || set('TELEGRAM_GROUP_ID'))) out.push('есть чат Telegram, но нет TELEGRAM_BOT_TOKEN')
  if (set('SMTP_HOST') && !set('SMTP_FROM') && !set('SMTP_USER')) out.push('SMTP_HOST задан без SMTP_FROM и SMTP_USER: письма не уйдут')
  return out
}
