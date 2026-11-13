/** Напоминание по заметке: когда пора слать (чистые функции, без базы). Время «ГГГГ-ММ-ДДTЧЧ:ММ» по часам сервера. */
export const REMIND_AT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/
/** Просроченное при простое сервера досылается один раз, но не старше суток. */
export const REMIND_GRACE_MS = 24 * 3600 * 1000

export type RemindState = 'none' | 'wait' | 'due' | 'stale'

/** none: напоминать нечего (нет времени, уже отправлено, заметка в корзине); wait: ещё рано; due: пора; stale: просрочено больше суток, не шлём. */
export function remindState(n: { remindAt: string | null; remindSent: boolean; deletedAt: unknown }, now: Date): RemindState {
  if (!n.remindAt || n.remindSent || n.deletedAt !== null && n.deletedAt !== undefined) return 'none'
  if (!REMIND_AT.test(n.remindAt)) return 'none'
  const at = new Date(n.remindAt).getTime() // без пояса читается как местное время сервера
  if (!Number.isFinite(at)) return 'none'
  if (now.getTime() < at) return 'wait'
  return now.getTime() - at > REMIND_GRACE_MS ? 'stale' : 'due'
}

/** Отметка «отправлено» после сохранения списка: сбрасывается, только если время напоминания поменяли. */
export const nextRemindSent = (prev: { remindAt: string | null; remindSent: boolean } | undefined, remindAt: string | null) =>
  !!prev && prev.remindAt === remindAt && prev.remindSent
