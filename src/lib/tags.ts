/** Теги заметок и картинок. Те же правила, что на сервере (server/src/tags.ts): без «#», строчные, слова через дефис. */
export const MAX_TAGS = 10
export const MAX_TAG_LEN = 30

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

/** Чистый список тегов: дубли и пустые убраны, не больше MAX_TAGS. */
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const t of v) {
    const c = cleanTag(t)
    if (c && !out.includes(c)) out.push(c)
    if (out.length >= MAX_TAGS) break
  }
  return out
}
