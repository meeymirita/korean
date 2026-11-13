/** Напоминание о незаконченном экзамене: когда черновик «залежался». Чистые функции без базы. */
export const DRAFT_REMIND_MS = 3 * 86_400_000

export interface DraftRemind {
  /** сколько частей сохранено */
  saved: number
  /** сколько всего */
  parts: number
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Когда черновик менялся в последний раз: `savedAt` (ставит сервер при сохранении), у старых черновиков `startedAt`. 0, если времени нет. */
export function draftTouchedAt(draft: unknown): number {
  const d = draft && typeof draft === 'object' && !Array.isArray(draft) ? (draft as Record<string, unknown>) : {}
  return num(d.savedAt) || num(d.startedAt)
}

/**
 * Пора ли напомнить о черновике: он есть, с последнего изменения прошло не меньше 3 суток, сохранена хотя бы часть, но не все,
 * и экзамен не сдан после начала этого черновика (`lastResultAt`: когда отправлен последний итог; итог позже начала значит, что черновик остался от сданной попытки).
 */
export function draftRemind(draft: unknown, now: number, lastResultAt = 0): DraftRemind | null {
  const touched = draftTouchedAt(draft)
  if (!touched || now - touched < DRAFT_REMIND_MS) return null
  const d = draft as { startedAt?: unknown; results?: unknown }
  if (lastResultAt && lastResultAt >= num(d.startedAt)) return null
  if (!Array.isArray(d.results) || !d.results.length) return null
  const saved = d.results.filter(Boolean).length
  if (saved < 1 || saved >= d.results.length) return null
  return { saved, parts: d.results.length }
}
