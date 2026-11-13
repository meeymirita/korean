/** Заметки владельца: название и описание. Список целиком заменяется одним запросом. */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { MAX_NOTES, MAX_NOTE_IMAGES, MAX_NOTE_TEXT, MAX_NOTE_TITLE } from '../config.js'
import { Db } from '../db/db.service.js'
import { pruneImages } from '../images/images.service.js'
import { parseTags, readTags } from '../tags.js'
import { SearchClient } from '../search/search.client.js'
import { REMIND_AT, nextRemindSent } from './remind.js'
import { TRASH_DAYS, splitNotesReplace } from '../trash/trash.js'

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
  /** закреплена сверху списка */
  pinned: boolean
  /** «Напомнить в»: ГГГГ-ММ-ДДTЧЧ:ММ по часам сервера или null */
  remindAt: string | null
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
    const rows = await (await this.db.orm()).note.findMany({ where: { deletedAt: null }, orderBy: [{ pinned: 'desc' }, { created: 'desc' }] })
    return { v: 1, updated: Number(updated), notes: rows.map(r => this.out(r)) }
  }

  private out(r: { id: string; title: string; text: string; images: string; tags: string; created: bigint; updated: bigint; pinned: boolean; remindAt: string | null }): Note {
    return { id: r.id, title: r.title, text: r.text, images: this.parseImages(r.images), tags: readTags(r.tags), created: Number(r.created), updated: Number(r.updated), pinned: r.pinned, remindAt: r.remindAt }
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
      if (n.pinned !== undefined && typeof n.pinned !== 'boolean') throw new BadRequestException({ error: 'invalid notes' })
      const remindAt = n.remindAt ?? null
      if (remindAt !== null && (typeof remindAt !== 'string' || !REMIND_AT.test(remindAt))) throw new BadRequestException({ error: 'invalid notes' })
      notes.push({ id: n.id, title: n.title, text: n.text, images, tags, created: n.created, updated: n.updated, pinned: n.pinned === true, remindAt })
    }
    return { updated: num(data.updated) ? data.updated : 0, notes }
  }

  /** Заменяет список живых заметок; убранные из него уходят в корзину (на 30 дней), а не стираются. При ошибке проверки всё остаётся как было. */
  async replace(body: unknown) {
    const { updated, notes } = this.validate(body)
    await this.db.tx(async () => {
      const db = await this.db.orm()
      const existing = await db.note.findMany({ select: { id: true, deletedAt: true, remindAt: true, remindSent: true } })
      const { keep, toTrash } = splitNotesReplace(existing, notes.map(n => n.id))
      const prev = new Map(existing.map(r => [r.id, r]))
      if (toTrash.length) await db.note.updateMany({ where: { id: { in: toTrash } }, data: { deletedAt: BigInt(Date.now()) } })
      await db.note.deleteMany({ where: { id: { in: keep } } })
      if (notes.length) await db.note.createMany({ data: notes.map(n => ({ ...n, remindSent: nextRemindSent(prev.get(n.id), n.remindAt), images: JSON.stringify(n.images), tags: JSON.stringify(n.tags), created: BigInt(n.created), updated: BigInt(n.updated) })) })
      await this.db.setMeta('notes_updated', String(updated))
    })
    await pruneImages(this.db) // картинки, убранные из заметок, удаляются через час; картинки заметок из корзины остаются
    this.search.schedulePrivateReindex()
    return { ok: true, updated }
  }

  /** Корзина: убранные заметки, свежие сверху; `deletedAt` в мс, `days` срок хранения. */
  async trash() {
    const rows = await (await this.db.orm()).note.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
    return { days: TRASH_DAYS, items: rows.map(r => ({ ...this.out(r), deletedAt: Number(r.deletedAt) })) }
  }

  private async inTrash(id: string) {
    const row = await (await this.db.orm()).note.findFirst({ where: { id, deletedAt: { not: null } } })
    if (!row) throw new NotFoundException({ error: 'not found' })
    return row
  }

  /** Возвращает заметку из корзины в список; `updated` растёт, чтобы сайт взял свежий список с сервера. */
  async restore(id: string) {
    const row = await this.inTrash(id)
    const db = await this.db.orm()
    if (await db.note.count({ where: { deletedAt: null } }) >= MAX_NOTES) throw new BadRequestException({ error: 'notes limit' })
    await db.note.update({ where: { id }, data: { deletedAt: null } })
    const updated = Date.now()
    await this.db.setMeta('notes_updated', String(updated))
    this.search.schedulePrivateReindex()
    return { ok: true, updated, note: this.out(row) }
  }

  /** Стирает заметку из корзины насовсем (вызывающий уже проверил повторный токен). */
  async purge(id: string) {
    await this.inTrash(id)
    await (await this.db.orm()).note.delete({ where: { id } })
    await pruneImages(this.db)
    return { ok: true }
  }

  /** Автоочистка: стирает заметки, убранные в корзину не позже `cutoff` (мс). Возвращает число стёртых. */
  async purgeOlderThan(cutoff: number) {
    const { count } = await (await this.db.orm()).note.deleteMany({ where: { deletedAt: { not: null, lte: BigInt(cutoff) } } })
    if (count) await pruneImages(this.db)
    return count
  }
}
