/** Показ строк таблиц во вкладке «База»: время человеку, а не числом. */

/** Колонки, в которых лежит время в миллисекундах. */
const TIME = new Set(['t', 'created', 'updated', 'expires', 'last', 'kd'])

export const isTimeColumn = (name: string) => TIME.has(name)

export interface DbCell {
  text: string
  /** полное значение для подсказки при наведении */
  title?: string
  muted?: boolean
}

export function formatCell(column: string, value: unknown): DbCell {
  if (value === null || value === undefined) return { text: '—', muted: true }
  if (isTimeColumn(column) && typeof value === 'number' && value > 0) {
    const d = new Date(value)
    return { text: d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }), title: String(value) }
  }
  if (value === '') return { text: '(пусто)', muted: true }
  if (typeof value === 'string') return { text: value }
  return { text: String(value) }
}

/** Диапазон строк для подписи «1–50 из 320». */
export function rangeText(offset: number, shown: number, total: number) {
  if (!total || !shown) return '0 строк'
  return `${offset + 1}–${offset + shown} из ${total}`
}
