/** Сохранённые наборы страницы «Сегодня»: снимок слов, правила, заданий и ответов. Сервер ничего не считает, только хранит. */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { MAX_SETS, MAX_SET_DATA } from '../config'
import { Db } from '../db/db.service'

interface Row {
  id: string
  day: string
  right_n: number
  total_n: number
  data: string
  created: number
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000

@Injectable()
export class SetsService {
  constructor(private readonly db: Db) {}

  /** Новые сверху. */
  list() {
    const rows = this.db.all<Row>('SELECT id, day, right_n, total_n, data, created FROM today_sets ORDER BY created DESC')
    return {
      items: rows.map(r => {
        let data: unknown = null
        try {
          data = JSON.parse(r.data)
        } catch {
          /* битый снимок: покажем без подробностей */
        }
        return { id: r.id, day: r.day, right: r.right_n, total: r.total_n, created: r.created, data }
      }),
    }
  }

  create(body: { day?: unknown; right?: unknown; total?: unknown; data?: unknown } | undefined) {
    const b = body ?? {}
    if (typeof b.day !== 'string' || !DAY.test(b.day) || !count(b.right) || !count(b.total) || b.right > b.total) throw new BadRequestException({ error: 'invalid set' })
    if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) throw new BadRequestException({ error: 'invalid set' })
    const json = JSON.stringify(b.data)
    if (json.length > MAX_SET_DATA) throw new BadRequestException({ error: 'set too large' })
    if (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM today_sets')!.n >= MAX_SETS) throw new BadRequestException({ error: 'too many sets' })
    const id = randomBytes(8).toString('hex')
    const created = Date.now()
    this.db.run('INSERT INTO today_sets (id, day, right_n, total_n, data, created) VALUES (?, ?, ?, ?, ?, ?)', id, b.day, b.right, b.total, json, created)
    return { id, day: b.day, right: b.right, total: b.total, created, data: b.data }
  }

  remove(id: string) {
    const r = this.db.run('DELETE FROM today_sets WHERE id = ?', id)
    if (!r.changes) throw new NotFoundException({ error: 'not found' })
    return { ok: true }
  }
}
