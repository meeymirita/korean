/** «Тетрадь»: папки (любая вложенность до MAX_NB_DEPTH) и листы с рисунком, текстом и шаблоном фона. Штрихи лежат в базе как JSON. */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { MAX_NB_DEPTH, MAX_NB_ITEMS, MAX_NB_NAME, MAX_NB_STROKES, MAX_NB_TEXT } from '../config'
import { Db } from '../db/db.service'

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

  list() {
    const items = this.db.all<Meta>('SELECT id, kind, name, parent, tpl, fav, created, updated FROM nb_items ORDER BY kind DESC, name COLLATE NOCASE, created')
    return { items }
  }

  private row(id: string): Row {
    const r = ID.test(id) ? this.db.get<Row>('SELECT * FROM nb_items WHERE id = ?', id) : undefined
    if (!r) throw new NotFoundException({ error: 'not found' })
    return r
  }

  one(id: string) {
    const r = this.row(id)
    return { ...this.meta(r), text: r.text, strokes: JSON.parse(r.strokes) as unknown[] }
  }

  /** Сколько папок над элементом, включая саму папку. 0 для корня. */
  private depth(id: string | null): number {
    let n = 0
    while (id) {
      const r = this.db.get<{ parent: string | null }>('SELECT parent FROM nb_items WHERE id = ?', id)
      if (!r) break
      n++
      id = r.parent
      if (n > MAX_NB_DEPTH + 2) break
    }
    return n
  }

  private checkParent(parent: unknown, selfId?: string): string | null {
    if (parent === null || parent === '') return null
    if (typeof parent !== 'string' || !ID.test(parent)) throw bad('invalid parent')
    const p = this.db.get<Row>('SELECT * FROM nb_items WHERE id = ?', parent)
    if (!p || p.kind !== 'folder') throw bad('invalid parent')
    if (selfId) {
      for (let id: string | null = parent; id; id = this.db.get<{ parent: string | null }>('SELECT parent FROM nb_items WHERE id = ?', id)?.parent ?? null) {
        if (id === selfId) throw bad('folder inside itself')
      }
    }
    if (this.depth(parent) >= MAX_NB_DEPTH) throw bad('too deep')
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

  create(body: Record<string, unknown> | undefined) {
    const b = body ?? {}
    if (b.kind !== 'folder' && b.kind !== 'sheet') throw bad('invalid kind')
    if (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM nb_items')!.n >= MAX_NB_ITEMS) throw bad('too many items')
    const name = this.name(b.name ?? (b.kind === 'folder' ? 'Новая папка' : 'Новый лист'))
    const parent = this.checkParent(b.parent ?? null)
    const tpl = b.tpl === undefined ? 'blank' : this.tpl(b.tpl)
    const id = randomBytes(8).toString('hex')
    const now = Date.now()
    this.db.run('INSERT INTO nb_items (id, kind, name, parent, tpl, text, strokes, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, b.kind, name, parent, tpl, '', '[]', now, now)
    return this.one(id)
  }

  update(id: string, body: Record<string, unknown> | undefined) {
    const r = this.row(id)
    const b = body ?? {}
    const sets: string[] = []
    const vals: (string | number | null)[] = []
    const put = (col: string, v: string | number | null) => { sets.push(`${col} = ?`); vals.push(v) }
    if (b.name !== undefined) put('name', this.name(b.name))
    if (b.parent !== undefined) put('parent', this.checkParent(b.parent, r.kind === 'folder' ? id : undefined))
    if (b.fav !== undefined) {
      if (typeof b.fav !== 'boolean') throw bad('invalid fav')
      put('fav', b.fav ? 1 : 0)
    }
    if (r.kind === 'sheet') {
      if (b.tpl !== undefined) put('tpl', this.tpl(b.tpl))
      if (b.text !== undefined) {
        if (typeof b.text !== 'string' || b.text.length > MAX_NB_TEXT) throw bad('invalid text')
        put('text', b.text)
      }
      if (b.strokes !== undefined) put('strokes', checkStrokes(b.strokes))
    } else if (b.tpl !== undefined || b.text !== undefined || b.strokes !== undefined) {
      throw bad('folder has no drawing')
    }
    if (!sets.length) throw bad('empty patch')
    this.db.run(`UPDATE nb_items SET ${sets.join(', ')}, updated = ? WHERE id = ?`, ...vals, Date.now(), id)
    return this.meta(this.row(id))
  }

  /** Удаляет элемент; у папки вместе со всем содержимым. */
  remove(id: string) {
    this.row(id)
    this.db.tx(() => {
      const kill = (x: string) => {
        for (const c of this.db.all<{ id: string }>('SELECT id FROM nb_items WHERE parent = ?', x)) kill(c.id)
        this.db.run('DELETE FROM nb_items WHERE id = ?', x)
      }
      kill(id)
    })
    return { ok: true }
  }
}
