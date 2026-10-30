/** Теги заметок и картинок: хранятся без «#», строчными, слова через дефис (в интерфейсе показываются как #test-tag). */
export const MAX_TAGS = 10
export const MAX_TAG_LEN = 30

/** Приводит тег к виду `test-tag`; пустую строку и недопустимые символы убирает. */
export function cleanTag(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_TAG_LEN)
}

/** Список тегов из тела запроса: null, если это не список или он длиннее лимита; дубли и пустые убираются. */
export function parseTags(v: unknown): string[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > MAX_TAGS) return null
  const out: string[] = []
  for (const t of v) {
    const c = cleanTag(t)
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

/** Читает JSON-список из базы; битое значение даёт пустой список. */
export function readTags(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? '[]')
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').slice(0, MAX_TAGS) : []
  } catch {
    return []
  }
}
