/**
 * Фото Юны на карточках грамматики (инфографики владельца).
 * Файлы лежат на Яндекс.Диске в папке `korean_grammar` (в корне папки приложения): `lesson-N.webp` для пройденных уроков 1–10 части 1
 * и `own-<id>.webp` для своих карточек (без подписи урока). Сервер отдаёт их по `/api/pic/grammar/<имя>` (перенаправление на ссылку Диска).
 * Загрузить, заменить и удалить фото владелец может прямо в открытой карточке (`useGrammarPhotos`): файл сразу ложится на Диск.
 * Какие фото есть, сайт спрашивает у сервера (`GET /api/pic/grammar`); список ниже нужен только до ответа сервера и если Диск не ответил.
 */
export const PHOTO_KEYS: ReadonlySet<string> = new Set([
  'lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'lesson-6', 'lesson-7', 'lesson-8', 'lesson-9', 'lesson-10',
  'own-adj', 'own-deul', 'own-hago', 'own-here', 'own-ijeo', 'own-juse', 'own-mor', 'own-nuga', 'own-pos', 'own-thanks', 'own-too_do', 'own-when_e', 'own-yeon',
  'own-past_my', 'own-future_my', 'own-man', 'own-counters', 'own-assim', 'own-rieul',
])

const TWIN: Record<string, string> = { past: 'own-past_my' }

export interface PhotoCard {
  id: string
  l?: string
  st: string
}

export const photoUrl = (key: string) => `/api/pic/grammar/${key}.webp`

/** Имя файла фото карточки: у пройденного урока части 1 по номеру («Урок 3» → lesson-3), у своей карточки по её id; у остальных фото не бывает. */
export function photoKey(g: PhotoCard): string | undefined {
  // урочная карточка с той же темой, что своя: берёт её картинку (прошедшее время: «Урок 16-1» → own-past_my)
  if (TWIN[g.id]) return TWIN[g.id]
  if (g.l) {
    const m = /^Урок (\d+)$/.exec(g.l)
    return m && g.st === 'ok' ? `lesson-${m[1]}` : undefined
  }
  return `own-${g.id}`
}

/** Адрес фото карточки, если оно есть в списке `has` (по умолчанию список из кода). */
export function photoOf(g: PhotoCard, has: ReadonlySet<string> = PHOTO_KEYS): string | undefined {
  const key = photoKey(g)
  return key && has.has(key) ? photoUrl(key) : undefined
}
