/** Просмотр базы только для чтения: список таблиц и их строки с поиском. Названия таблиц берутся из самой базы, а не из запроса. */
import { Injectable, NotFoundException } from '@nestjs/common'
import { Db } from '../db/db.service'

const MAX_LIMIT = 200
const CELL = 300
/** Эти колонки показываем скрытыми (хэши гостевых токенов). */
const HIDDEN = new Set(['hash'])

@Injectable()
export class DbViewerService {
  constructor(private readonly db: Db) {}

  private names() {
    return this.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r => r.name)
  }

  tables() {
    return this.names().map(name => ({ name, rows: this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name}"`)!.n }))
  }

  /** Строки таблицы, новые сверху; q ищет по всем колонкам. */
  rows(name: string, limitRaw: unknown, offsetRaw: unknown, q: unknown) {
    if (!this.names().includes(name)) throw new NotFoundException({ error: 'unknown table' })
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limitRaw)) || 50))
    const offset = Math.max(0, Math.floor(Number(offsetRaw)) || 0)
    const columns = this.db.all<{ name: string; type: string }>(`PRAGMA table_info("${name}")`).map(c => ({ name: c.name, type: c.type }))

    const search = typeof q === 'string' ? q.trim().slice(0, 100) : ''
    const where = search ? `WHERE ${columns.map(c => `CAST("${c.name}" AS TEXT) LIKE ? ESCAPE '\\'`).join(' OR ')}` : ''
    const params = search ? columns.map(() => `%${search.replace(/[\\%_]/g, m => '\\' + m)}%`) : []

    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name}" ${where}`, ...params)!.n
    const rows = this.db
      .all<Record<string, unknown>>(`SELECT * FROM "${name}" ${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`, ...params, limit, offset)
      .map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, this.cell(k, v)])))
    return { table: name, columns, rows, total, limit, offset }
  }

  private cell(column: string, v: unknown) {
    if (HIDDEN.has(column) && v) return '••••••'
    if (typeof v === 'string' && v.length > CELL) return v.slice(0, CELL) + '…'
    return v
  }
}
