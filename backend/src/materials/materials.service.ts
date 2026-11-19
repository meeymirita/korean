/** Присланные материалы (тетради, учебник, задания Леры): пачки во «Входящих» страницы «Слова». */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { Db } from '../db/db.service.js'
import { NewWordsService } from '../newwords/newwords.service.js'
import { cleanMaterial, MAX_BATCHES } from './materials.schema.js'

export const STATUSES = ['new', 'done'] as const

const view = (r: { id: string; source: string; kind: string; items: string; status: string; created: bigint }) => ({
  id: r.id,
  source: r.source,
  kind: r.kind,
  status: r.status,
  created: Number(r.created),
  items: JSON.parse(r.items) as unknown[],
})

@Injectable()
export class MaterialsService {
  constructor(
    private readonly db: Db,
    private readonly words: NewWordsService,
  ) {}

  async list() {
    const rows = await (await this.db.orm()).material.findMany({ orderBy: { created: 'desc' } })
    return { batches: rows.map(view) }
  }

  /** Сохраняет пачку; слова из неё дополнительно попадают в «Новые слова» (повтор слова уже записанного не добавляется). */
  async add(body: unknown) {
    const data = cleanMaterial(body)
    const db = await this.db.orm()
    if ((await db.material.count()) >= MAX_BATCHES) throw new BadRequestException({ error: 'too many batches' })
    const row = await db.material.create({ data: { id: randomBytes(8).toString('hex'), source: data.source, kind: data.kind, items: JSON.stringify(data.items), created: BigInt(Date.now()) } })
    const have = new Set((await db.newWord.findMany({ select: { ko: true } })).map(w => w.ko))
    let wordsAdded = 0
    for (const it of data.items) {
      if (it.type !== 'word' || have.has(it.ko)) continue
      try {
        await this.words.add({ ko: it.ko, reading: it.reading, ru: it.ru, example: it.example, note: it.note ? `${it.note}\n(${data.source})` : data.source })
        have.add(it.ko)
        wordsAdded++
      } catch {
        break // лимит «Новых слов»: остальные остаются только в пачке
      }
    }
    const counts: Record<string, number> = {}
    for (const it of data.items) counts[it.type] = (counts[it.type] ?? 0) + 1
    return { id: row.id, items: data.items.length, counts, wordsAdded }
  }

  async setStatus(id: string, body: unknown) {
    const status = (body as { status?: unknown } | null)?.status
    if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status)) throw new BadRequestException({ error: `status: ${STATUSES.join(' | ')}` })
    const db = await this.db.orm()
    if (!(await db.material.findUnique({ where: { id } }))) throw new NotFoundException({ error: 'not found' })
    return view(await db.material.update({ where: { id }, data: { status } }))
  }

  async remove(id: string) {
    const r = await (await this.db.orm()).material.deleteMany({ where: { id } })
    if (!r.count) throw new NotFoundException({ error: 'not found' })
    return { ok: true }
  }
}
