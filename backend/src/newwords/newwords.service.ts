/** Новые слова владельца, которые ещё не внесены в словарь (вкладка «Не добавленные»). */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { Db } from '../db/db.service.js'

export const MAX_NEW_WORDS = 500
const LIMITS = { ko: 60, reading: 80, ru: 120, example: 200, note: 3000 } as const
type Field = keyof typeof LIMITS

@Injectable()
export class NewWordsService {
  constructor(private readonly db: Db) {}

  async list() {
    const rows = await (await this.db.orm()).newWord.findMany({ orderBy: { created: 'desc' } })
    return { words: rows.map(r => ({ ...r, created: Number(r.created) })) }
  }

  /** Проверяет поля: нужны «корейский» и «перевод» либо хотя бы заметка (любой текст), остальное можно пустым; лишние пробелы убираются. */
  private clean(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const out = {} as Record<Field, string>
    for (const f of Object.keys(LIMITS) as Field[]) {
      const v = b[f] === undefined ? '' : b[f]
      if (typeof v !== 'string') throw new BadRequestException({ error: 'invalid word' })
      out[f] = v.trim()
      if (out[f].length > LIMITS[f]) throw new BadRequestException({ error: `too long: ${f}` })
    }
    if (!out.note && (!out.ko || !out.ru)) throw new BadRequestException({ error: 'ko and ru required' })
    return out
  }

  async add(body: unknown) {
    const data = this.clean(body)
    const db = await this.db.orm()
    if ((await db.newWord.count()) >= MAX_NEW_WORDS) throw new BadRequestException({ error: 'too many words' })
    const row = await db.newWord.create({ data: { id: randomBytes(8).toString('hex'), ...data, created: BigInt(Date.now()) } })
    return { ...row, created: Number(row.created) }
  }

  async update(id: string, body: unknown) {
    const data = this.clean(body)
    const db = await this.db.orm()
    if (!(await db.newWord.findUnique({ where: { id } }))) throw new NotFoundException({ error: 'not found' })
    const row = await db.newWord.update({ where: { id }, data })
    return { ...row, created: Number(row.created) }
  }

  async remove(id: string) {
    const r = await (await this.db.orm()).newWord.deleteMany({ where: { id } })
    if (!r.count) throw new NotFoundException({ error: 'not found' })
    return { ok: true }
  }
}
