/** «Тетрадь»: папки (любая вложенность до MAX_NB_DEPTH) и листы с рисунком, текстом и шаблоном фона. Штрихи лежат в базе как JSON. */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { MAX_NB_DEPTH, MAX_NB_ITEMS, MAX_NB_NAME, MAX_NB_STROKES, MAX_NB_TEXT } from '../config.js'
import { Db } from '../db/db.service.js'

export const TEMPLATES = ['blank', 'grid', 'lines', 'dots', 'hangul'] as const

interface Row {
  id: string
  kind: 'folder' | 'sheet'
  name: string
  parent: string | null
  tpl: string
  text: string
  strokes: string
  fav: number
  created: number
  updated: number
}
export type Meta = Omit<Row, 'text' | 'strokes'>

const ID = /^[a-f0-9]{16}$/
const bad = (error: string) => new BadRequestException({ error })

/** Штрихи: массив { c: цвет, w: толщина, p: [[x, y, нажим], …] }. Лишнее не пропускаем. */
function checkStrokes(v: unknown): string {
  if (!Array.isArray(v)) throw bad('invalid strokes')
  for (const s of v) {
    if (!s || typeof s !== 'object') throw bad('invalid strokes')
    const { c, w, p } = s as { c: unknown; w: unknown; p: unknown }
    if (typeof c !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(c) || typeof w !== 'number' || !(w > 0 && w <= 60) || !Array.isArray(p)) throw bad('invalid strokes')
    for (const pt of p) {
      if (!Array.isArray(pt) || pt.length !== 3 || pt.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw bad('invalid strokes')
    }
  }
  const json = JSON.stringify(v)
  if (json.length > MAX_NB_STROKES) throw bad('drawing too large')
  return json
}

@Injectable()
export class NotebookService {
  constructor(private readonly db: Db) {}

  private meta(r: Row): Meta {
    const { text: _t, strokes: _s, ...m } = r
    return m
  }

  async list() {
    const items = (await (await this.db.orm()).nbItem.findMany({ select: { id: true, kind: true, name: true, parent: true, tpl: true, fav: true, created: true, updated: true }, orderBy: [{ kind: 'desc' }, { name: 'asc' }, { created: 'asc' }] }) as (Omit<Meta, 'created' | 'updated'> & { created: bigint; updated: bigint })[])
      .map(item => ({ ...item, created: Number(item.created), updated: Number(item.updated) }))
    return { items }
  }

  private async row(id: string): Promise<Row> {
    const raw = ID.test(id) ? await (await this.db.orm()).nbItem.findUnique({ where: { id } }) : null
    const r = raw ? { ...raw, created: Number(raw.created), updated: Number(raw.updated) } as Row : undefined
    if (!r) throw new NotFoundException({ error: 'not found' })
    return r
  }

  async one(id: string) {
    const r = await this.row(id)
    return { ...this.meta(r), text: r.text, strokes: JSON.parse(r.strokes) as unknown[] }
  }

  /** Сколько папок над элементом, включая саму папку. 0 для корня. */
  private async depth(id: string | null): Promise<number> {
    let n = 0
    while (id) {
      const r = await (await this.db.orm()).nbItem.findUnique({ where: { id }, select: { parent: true } })
      if (!r) break
      n++
      id = r.parent
      if (n > MAX_NB_DEPTH + 2) break
    }
    return n
  }

  private async checkParent(parent: unknown, selfId?: string): Promise<string | null> {
    if (parent === null || parent === '') return null
    if (typeof parent !== 'string' || !ID.test(parent)) throw bad('invalid parent')
    const p = await (await this.db.orm()).nbItem.findUnique({ where: { id: parent } }) as Row | null
    if (!p || p.kind !== 'folder') throw bad('invalid parent')
    if (selfId) {
      for (let id: string | null = parent; id;) {
        if (id === selfId) throw bad('folder inside itself')
        id = (await (await this.db.orm()).nbItem.findUnique({ where: { id }, select: { parent: true } }))?.parent ?? null
      }
    }
    if (await this.depth(parent) >= MAX_NB_DEPTH) throw bad('too deep')
    return parent
  }

  private name(v: unknown): string {
    if (typeof v !== 'string') throw bad('invalid name')
    const t = v.trim()
    if (!t || t.length > MAX_NB_NAME) throw bad('invalid name')
    return t
  }

  private tpl(v: unknown): string {
    if (typeof v !== 'string' || !(TEMPLATES as readonly string[]).includes(v)) throw bad('invalid template')
    return v
  }

  async create(body: Record<string, unknown> | undefined) {
    const b = body ?? {}
    if (b.kind !== 'folder' && b.kind !== 'sheet') throw bad('invalid kind')
    if (await (await this.db.orm()).nbItem.count() >= MAX_NB_ITEMS) throw bad('too many items')
    const name = this.name(b.name ?? (b.kind === 'folder' ? 'Новая папка' : 'Новый лист'))
    const parent = await this.checkParent(b.parent ?? null)
    const tpl = b.tpl === undefined ? 'blank' : this.tpl(b.tpl)
    const id = randomBytes(8).toString('hex')
    const now = Date.now()
    await (await this.db.orm()).nbItem.create({ data: { id, kind: b.kind, name, parent, tpl, text: '', strokes: '[]', fav: 0, created: BigInt(now), updated: BigInt(now) } })
    return await this.one(id)
  }

  async update(id: string, body: Record<string, unknown> | undefined) {
    const r = await this.row(id)
    const b = body ?? {}
    const data: Record<string, string | number | null> = {}
    if (b.name !== undefined) data.name = this.name(b.name)
    if (b.parent !== undefined) data.parent = await this.checkParent(b.parent, r.kind === 'folder' ? id : undefined)
    if (b.fav !== undefined) {
      if (typeof b.fav !== 'boolean') throw bad('invalid fav')
      data.fav = b.fav ? 1 : 0
    }
    if (r.kind === 'sheet') {
      if (b.tpl !== undefined) data.tpl = this.tpl(b.tpl)
      if (b.text !== undefined) {
        if (typeof b.text !== 'string' || b.text.length > MAX_NB_TEXT) throw bad('invalid text')
        data.text = b.text
      }
      if (b.strokes !== undefined) data.strokes = checkStrokes(b.strokes)
    } else if (b.tpl !== undefined || b.text !== undefined || b.strokes !== undefined) {
      throw bad('folder has no drawing')
    }
    if (!Object.keys(data).length) throw bad('empty patch')
    await (await this.db.orm()).nbItem.update({ where: { id }, data: { ...data, updated: BigInt(Date.now()) } })
    return this.meta(await this.row(id))
  }

  /** Удаляет элемент; у папки вместе со всем содержимым. */
  async remove(id: string) {
    await this.row(id)
    await this.db.tx(async () => {
      const kill = async (x: string): Promise<void> => {
        const db = await this.db.orm()
        for (const c of await db.nbItem.findMany({ where: { parent: x }, select: { id: true } })) await kill(c.id)
        await db.nbItem.delete({ where: { id: x } })
      }
      await kill(id)
    })
    return { ok: true }
  }
}
