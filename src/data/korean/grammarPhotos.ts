/**
 * Фото Юны на карточках грамматики (инфографики владельца).
 * Файлы лежат в `src/assets/grammar/`: `lesson-N.webp` для пройденных уроков 1–10 части 1 и `own-<id>.webp` для своих карточек (без подписи урока).
 * Новое фото: положи файл с таким именем, больше нигде ничего менять не нужно.
 */
const FILES = import.meta.glob('../../assets/grammar/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const BY_KEY: Record<string, string> = {}
for (const [path, url] of Object.entries(FILES)) BY_KEY[path.split('/').pop()!.replace(/\.webp$/, '')] = url

/** Фото карточки: у урока части 1 по номеру («Урок 3» → lesson-3), у своей карточки по её id; у остальных нет. */
export function photoOf(g: { id: string; l?: string; st: string }): string | undefined {
  if (g.l) {
    const m = /^Урок (\d+)$/.exec(g.l)
    return m && g.st === 'ok' ? BY_KEY[`lesson-${m[1]}`] : undefined
  }
  return BY_KEY[`own-${g.id}`]
}
