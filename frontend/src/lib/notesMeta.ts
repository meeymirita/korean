/** Закрепление, корзина и «Напомнить в» у заметок: чистые функции без сайта и сервера. */
export const TRASH_DAYS = 30
const DAY = 24 * 3600 * 1000

/** Сколько полных суток осталось лежать в корзине (не меньше 0). Те же 30 суток, что на сервере (backend/src/trash/trash.ts). */
export const trashDaysLeft = (deletedAt: number, now = Date.now()) => Math.max(0, Math.ceil((deletedAt + TRASH_DAYS * DAY - now) / DAY))

const plural = (n: number, one: string, few: string, many: string) => {
  const m = n % 100
  if (m >= 11 && m <= 14) return many
  return n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many
}
export const daysLeftLabel = (n: number) => (n <= 0 ? 'сегодня будет удалено' : `осталось ${n} ${plural(n, 'день', 'дня', 'дней')}`)

/** Закреплённые первыми; внутри групп прежний порядок: новые сверху. Исходный массив не меняется. */
export function sortNotes<T extends { pinned?: boolean; created: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.created - a.created)
}

/** «Напомнить в»: ГГГГ-ММ-ДДTЧЧ:ММ по часам сервера (тот же формат, что у поля datetime-local). */
export const REMIND_AT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/
export const cleanRemind = (v: unknown): string | null => (typeof v === 'string' && REMIND_AT.test(v) ? v : null)

/** Время для карточки без пересчёта поясов: что записано, то и показываем («4 мая, 09:30»). */
export function formatRemind(v: string | null | undefined): string {
  const s = cleanRemind(v)
  if (!s) return ''
  const [y, mo, d, h, mi] = s.split(/[-T:]/).map(Number) as [number, number, number, number, number]
  const date = new Date(y, mo - 1, d, h, mi)
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(y !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) })
  return `${day}, ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}
