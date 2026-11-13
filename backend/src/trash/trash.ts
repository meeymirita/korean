/** Корзина заметок и картинок: срок хранения и расчёты по нему (чистые функции, без базы). */
export const TRASH_DAYS = 30
export const TRASH_MS = TRASH_DAYS * 24 * 3600 * 1000

/** Удалённое раньше этой отметки (мс) уже просрочено. */
export const trashCutoff = (now: number) => now - TRASH_MS

export const isTrashExpired = (deletedAt: number, now: number) => deletedAt <= trashCutoff(now)

/** Когда запись пропадёт из корзины окончательно (мс). */
export const trashExpiresAt = (deletedAt: number) => deletedAt + TRASH_MS

/** Сколько полных суток осталось (не меньше 0). */
export const trashDaysLeft = (deletedAt: number, now: number) => Math.max(0, Math.ceil((trashExpiresAt(deletedAt) - now) / (24 * 3600 * 1000)))

/**
 * Что делать с заметками, когда клиент присылает весь список живых: присланные заметки живые (в том числе вернувшиеся из корзины),
 * живые заметки, которых в списке нет, уходят в корзину, а не стираются; заметки, уже лежащие в корзине и не присланные, не трогаем.
 */
export function splitNotesReplace(existing: { id: string; deletedAt: bigint | number | null }[], incomingIds: string[]) {
  const kept = new Set(incomingIds)
  const toTrash = existing.filter(r => r.deletedAt === null && !kept.has(r.id)).map(r => r.id)
  return { keep: incomingIds, toTrash }
}
