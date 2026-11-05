/** Сохранённые наборы страницы «Сегодня»: снимок слов, правила, заданий и ответов. Сервер ничего не считает, только хранит. */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { MAX_SETS, MAX_SET_DATA } from '../config.js'
import { Db } from '../db/db.service.js'
import type { SetRow } from './sets.types.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000

@Injectable()
export class SetsService {
  constructor(private readonly db: Db) {}

  /** Новые сверху. */
  async list() {
    const records = await (await this.db.orm()).todaySet.findMany({ orderBy: { created: 'desc' } })
    const rows: SetRow[] = records.map(row => ({ ...row, created: Number(row.created) }))
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

  async create(body: { day?: unknown; right?: unknown; total?: unknown; data?: unknown } | undefined) {
    const b = body ?? {}
    if (typeof b.day !== 'string' || !DAY.test(b.day) || !count(b.right) || !count(b.total) || b.right > b.total) throw new BadRequestException({ error: 'invalid set' })
    if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) throw new BadRequestException({ error: 'invalid set' })
    const json = JSON.stringify(b.data)
    if (json.length > MAX_SET_DATA) throw new BadRequestException({ error: 'set too large' })
    if (await (await this.db.orm()).todaySet.count() >= MAX_SETS) throw new BadRequestException({ error: 'too many sets' })
    const id = randomBytes(8).toString('hex')
    const created = Date.now()
    await (await this.db.orm()).todaySet.create({ data: { id, day: b.day, right_n: b.right, total_n: b.total, data: json, created: BigInt(created) } })
    return { id, day: b.day, right: b.right, total: b.total, created, data: b.data }
  }

  async remove(id: string) {
    const r = await (await this.db.orm()).todaySet.deleteMany({ where: { id } })
    if (!r.count) throw new NotFoundException({ error: 'not found' })
    return { ok: true }
  }
}
