/** Заметки владельца: название и описание. Список целиком заменяется одним запросом. */
import { BadRequestException, Injectable } from '@nestjs/common'
import { MAX_NOTES, MAX_NOTE_IMAGES, MAX_NOTE_TEXT, MAX_NOTE_TITLE } from '../config.js'
import { Db } from '../db/db.service.js'
import { pruneImages } from '../images/images.service.js'
import { parseTags, readTags } from '../tags.js'
import { SearchClient } from '../search/search.client.js'

export interface Note {
  id: string
  title: string
  text: string
  /** id картинок из раздела «Картинки» */
  images: string[]
  /** теги без «#» */
  tags: string[]
  created: number
  updated: number
}

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const IMAGE_ID = /^[a-f0-9]{16}$/
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

@Injectable()
export class NotesService {
  constructor(private readonly db: Db, private readonly search: SearchClient) {}

  /** Заметки владельца; пустой объект, пока ничего не сохраняли. */
  async read() {
    const updated = await this.db.getMeta('notes_updated')
    if (updated === undefined) return {}
    const rows = await (await this.db.orm()).note.findMany({ orderBy: { created: 'desc' } })
    return { v: 1, updated: Number(updated), notes: rows.map(r => ({ ...r, created: Number(r.created), updated: Number(r.updated), images: this.parseImages(r.images), tags: readTags(r.tags) })) }
  }

  private parseImages(raw: string): string[] {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && IMAGE_ID.test(x)).slice(0, MAX_NOTE_IMAGES) : []
    } catch {
      return []
    }
  }

  /** Проверяет тело запроса; при нарушении формата или лимитов — 400. Ничего не сохраняет. */
  validate(body: unknown) {
    const data = body as { v?: unknown; updated?: unknown; notes?: unknown }
    if (!data || typeof data !== 'object' || data.v !== 1 || !Array.isArray(data.notes) || data.notes.length > MAX_NOTES) {
      throw new BadRequestException({ error: 'invalid notes' })
    }
    const ids = new Set<string>()
    const notes: Note[] = []
    for (const n of data.notes as Partial<Note>[]) {
      if (!n || typeof n !== 'object' || !isStr(n.id, 40) || !n.id || ids.has(n.id)) throw new BadRequestException({ error: 'invalid notes' })
      if (!isStr(n.title, MAX_NOTE_TITLE) || !isStr(n.text, MAX_NOTE_TEXT) || !num(n.created) || !num(n.updated)) {
        throw new BadRequestException({ error: 'invalid notes' })
      }
      const images = n.images === undefined ? [] : n.images
      if (!Array.isArray(images) || images.length > MAX_NOTE_IMAGES || !images.every(i => typeof i === 'string' && IMAGE_ID.test(i))) {
        throw new BadRequestException({ error: 'invalid notes' })
      }
      const tags = parseTags(n.tags)
      if (!tags) throw new BadRequestException({ error: 'invalid notes' })
      ids.add(n.id)
      notes.push({ id: n.id, title: n.title, text: n.text, images, tags, created: n.created, updated: n.updated })
    }
    return { updated: num(data.updated) ? data.updated : 0, notes }
  }

  /** Заменяет все заметки; при ошибке проверки старые заметки остаются. */
  async replace(body: unknown) {
    const { updated, notes } = this.validate(body)
    await this.db.tx(async () => {
      const db = await this.db.orm()
      await db.note.deleteMany()
      if (notes.length) await db.note.createMany({ data: notes.map(n => ({ ...n, images: JSON.stringify(n.images), tags: JSON.stringify(n.tags), created: BigInt(n.created), updated: BigInt(n.updated) })) })
      await this.db.setMeta('notes_updated', String(updated))
    })
    await pruneImages(this.db) // картинки, убранные из заметок, удаляются через час
    this.search.schedulePrivateReindex()
    return { ok: true, updated }
  }
}
