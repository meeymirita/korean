/**
 * Фото Юны на карточках грамматики (инфографики владельца).
 * Файлы лежат на Яндекс.Диске в папке `korean_grammar` (в корне папки приложения): `lesson-N.webp` для пройденных уроков 1–10 части 1
 * и `own-<id>.webp` для своих карточек (без подписи урока). Сервер отдаёт их по `/api/pic/grammar/<имя>` (перенаправление на ссылку Диска).
 * Заменить фото: положи файл с тем же именем в папку на Диске (если старое не грузится, окно грамматики само просит свежую ссылку: `?fresh`). Новое фото: ещё допиши его имя в KEYS.
 */
const KEYS = new Set([
  'lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'lesson-6', 'lesson-7', 'lesson-8', 'lesson-9', 'lesson-10',
  'own-adj', 'own-deul', 'own-hago', 'own-here', 'own-ijeo', 'own-juse', 'own-mor', 'own-nuga', 'own-pos', 'own-thanks', 'own-too_do', 'own-when_e', 'own-yeon',
  'own-past_my', 'own-future_my', 'own-man',
])

const TWIN: Record<string, string> = { past: 'own-past_my' }

const url = (key: string) => `/api/pic/grammar/${key}.webp`

/** Фото карточки: у урока части 1 по номеру («Урок 3» → lesson-3), у своей карточки по её id; у остальных нет. */
export function photoOf(g: { id: string; l?: string; st: string }): string | undefined {
  // урочная карточка с той же темой, что своя: берёт её картинку (прошедшее время: «Урок 16-1» → own-past_my)
  if (TWIN[g.id]) return url(TWIN[g.id]!)
  if (g.l) {
    const m = /^Урок (\d+)$/.exec(g.l)
    const key = m && g.st === 'ok' ? `lesson-${m[1]}` : ''
    return KEYS.has(key) ? url(key) : undefined
  }
  const key = `own-${g.id}`
  return KEYS.has(key) ? url(key) : undefined
}
