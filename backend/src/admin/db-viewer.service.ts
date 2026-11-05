/** Просмотр таблиц PostgreSQL в личном кабинете владельца без изменения данных. */
import { Injectable, NotFoundException } from '@nestjs/common'
import { Db } from '../db/db.service.js'

const MAX_LIMIT = 200
const CELL = 300
const HIDDEN = new Set(['hash'])

@Injectable()
export class DbViewerService {
  constructor(private readonly db: Db) {}

  private async names() {
    const rows = await this.db.all<{ name: string }>(`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `)
    return rows.map(row => row.name)
  }

  async tables() {
    const names = await this.names()
    return Promise.all(names.map(async name => {
      const count = await this.db.get<{ n: string | number }>(`SELECT COUNT(*) AS n FROM "${name}"`)
      return { name, rows: Number(count?.n || 0) }
    }))
  }

  /** Возвращает строки в порядке первичного ключа; параметр q ищет по тексту во всех столбцах. */
  async rows(name: string, limitRaw: unknown, offsetRaw: unknown, q: unknown) {
    if (!(await this.names()).includes(name)) throw new NotFoundException({ error: 'unknown table' })
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limitRaw)) || 50))
    const offset = Math.max(0, Math.floor(Number(offsetRaw)) || 0)
    const columns = await this.db.all<{ name: string; type: string }>(`
      SELECT column_name AS name, data_type AS type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position
    `, name)
    const key = await this.db.get<{ name: string }>(`
      SELECT kcu.column_name AS name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = current_schema() AND tc.table_name = ?
      ORDER BY kcu.ordinal_position LIMIT 1
    `, name)
    const orderBy = key?.name || columns[0]?.name
    const search = typeof q === 'string' ? q.trim().slice(0, 100) : ''
    const where = search ? `WHERE ${columns.map(column => `CAST("${column.name}" AS TEXT) ILIKE ? ESCAPE E'\\\\'`).join(' OR ')}` : ''
    const pattern = `%${search.replace(/[\\%_]/g, char => '\\' + char)}%`
    const params = search ? columns.map(() => pattern) : []
    const total = await this.db.get<{ n: string | number }>(`SELECT COUNT(*) AS n FROM "${name}" ${where}`, ...params)
    const rows = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM "${name}" ${where} ORDER BY "${orderBy}" DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset,
    )
    return {
      table: name,
      columns,
      rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([column, value]) => [column, this.cell(column, value)]))),
      total: Number(total?.n || 0),
      limit,
      offset,
    }
  }

  private cell(column: string, value: unknown) {
    if (HIDDEN.has(column) && value) return '••••••'
    if (typeof value === 'string' && value.length > CELL) return value.slice(0, CELL) + '…'
    return value
  }
}
