/** Музыкальный плеер: чистые функции без сервера и базы (подпись ссылок, разбор вывода yt-dlp, проверка имён и ссылок). */
import { createHmac, timingSafeEqual } from 'node:crypto'
import path from 'node:path'

/** Форматы, которые браузер играет сам; всё остальное после скачивания по ссылке переводится в m4a (AAC). */
export const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wav', 'webm', 'mp4'] as const
/** Что можно загрузить с компьютера. */
export const UPLOAD_EXT = new Set<string>(AUDIO_EXT)
/** Форматы, которые yt-dlp отдаёт готовыми и которые играют везде: перекодировать не нужно. */
export const PLAYABLE_EXT = new Set(['mp3', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'wav'])

/** Расширение файла в нижнем регистре без точки или пустая строка. */
export const extOf = (name: string) => path.extname(name).slice(1).toLowerCase()

/** multer читает имя файла из формы как latin1, а браузер шлёт UTF-8: «Моя_песня» превращается в «ÐÐ¾Ñ…». Возвращает исходные буквы (если имя уже в порядке, не меняет). */
export function fixUploadName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name) || /[^\u0000-\u00ff]/.test(name)) return name
  const fixed = Buffer.from(name, 'latin1').toString('utf8')
  return fixed.includes('\ufffd') ? name : fixed
}

/** Название песни из имени файла: без расширения, лишних пробелов и длиннее 150 знаков. */
export function titleFromName(name: string): string {
  const base = path.basename(name, path.extname(name)).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (base || 'Без названия').slice(0, 150)
}

export const cleanTitle = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t && t.length <= 150 ? t : null
}

/** Ссылка для yt-dlp: только http(s), без пробелов и переводов строк, не длиннее 500 знаков (чтобы в командную строку не попало лишнее). */
export function cleanUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const u = v.trim()
  if (!u || u.length > 500 || /\s/.test(u)) return null
  try {
    const x = new URL(u)
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.toString() : null
  } catch {
    return null
  }
}

/** Подписанный путь для проигрывателя: `<путь>?e=<до когда, мс>&s=<подпись>`. `<audio>` не умеет слать заголовок с токеном, поэтому ссылка живёт сама недолго. */
export function signPath(p: string, secret: string, now = Date.now(), ttlMs = 6 * 3600_000): string {
  const e = now + ttlMs
  return `${p}?e=${e}&s=${mac(p, e, secret)}`
}

const mac = (p: string, e: number, secret: string) => createHmac('sha256', secret).update(`${p}|${e}`).digest('hex').slice(0, 32)

/** Подпись верна и срок не вышел. */
export function verifySigned(p: string, e: unknown, s: unknown, secret: string, now = Date.now()): boolean {
  const exp = Number(e)
  if (!Number.isFinite(exp) || exp < now || typeof s !== 'string' || s.length !== 32) return false
  const a = Buffer.from(mac(p, exp, secret))
  const b = Buffer.from(s)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Процент из строки вывода yt-dlp (`--progress-template download:%(progress._percent_str)s`), например « 12.3%» → 12.3. */
export function parseProgress(line: string): number | null {
  const m = /^\s*download:\s*([\d.]+)%/.exec(line) ?? /\[download\]\s+([\d.]+)%/.exec(line)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
}

export interface YtdlpOptions {
  /** папка, куда складываются файлы */
  outDir: string
  /** файл cookies (необязательно): помогает, если YouTube просит подтвердить, что это не бот */
  cookies?: string
}

/** Общие настройки: без плейлистов, повторы, таймауты и паузы между запросами, чтобы запросы не выглядели как у бота. */
const COMMON = ['--no-playlist', '--no-warnings', '--retries', '3', '--socket-timeout', '30', '--sleep-requests', '1', '--js-runtimes', 'node']

/** Аргументы первого шага: узнать название и длительность, ничего не скачивая. */
export function infoArgs(url: string, o: Pick<YtdlpOptions, 'cookies'>): string[] {
  return [...COMMON, ...(o.cookies ? ['--cookies', o.cookies] : []), '--skip-download', '--dump-single-json', '--', url]
}

/** Аргументы второго шага: лучший звук без перекодирования, обложка в jpg, процент в одну строку. */
export function downloadArgs(url: string, o: YtdlpOptions): string[] {
  return [
    ...COMMON,
    ...(o.cookies ? ['--cookies', o.cookies] : []),
    '-f', 'bestaudio[ext=m4a]/bestaudio',
    '--write-thumbnail', '--convert-thumbnails', 'jpg',
    '--newline', '--progress-template', 'download:%(progress._percent_str)s',
    '-o', path.join(o.outDir, 'src.%(ext)s'),
    '--', url,
  ]
}

/** Короткое объяснение для владельца, если yt-dlp не смог скачать (последние строки ошибки, без путей). */
export function ytdlpError(stderr: string): string {
  const lines = stderr.split('\n').map(l => l.trim()).filter(Boolean)
  const err = [...lines].reverse().find(l => /^ERROR:/i.test(l)) ?? lines[lines.length - 1] ?? 'неизвестная ошибка'
  const text = err.replace(/^ERROR:\s*/i, '').replace(/\[[^\]]+\]\s*/, '').slice(0, 220)
  if (/sign in to confirm|not a bot|cookies/i.test(text)) return 'YouTube просит подтвердить, что это не бот. Нужен файл cookies (data/youtube-cookies.txt, docs/music.md)'
  if (/private|unavailable|removed|not available/i.test(text)) return 'Видео недоступно (закрыто, удалено или недоступно в стране сервера)'
  if (/unsupported url/i.test(text)) return 'Эта ссылка не поддерживается'
  return text
}
