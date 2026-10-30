/**
 * Записи календаря (занятия, созвоны, домашка) и файлы к ним: PDF, Word и картинки.
 * Файлы лежат в DATA_DIR/docs, миниатюры картинок в DATA_DIR/thumbs, описание в таблицах plans и plan_files.
 * Тип файла определяется по содержимому, а не по имени.
 */
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { DOCS, MAX_DOCS_TOTAL, MAX_PLANS, MAX_PLAN_FILES, MAX_PLAN_TEXT, MAX_PLAN_TITLE, THUMBS } from '../config'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'
import { sniff } from '../images/images.service'
import { parseTags, readTags } from '../tags'

export interface PlanFile {
  id: string
  plan_id: string
  name: string
  mime: string
  ext: string
  size: number
  thumb: number
  created: number
}

export interface Plan {
  id: string
  day: string
  time: string
  title: string
  text: string
  /** tutor — материал от репетитора, own — моё личное */
  kind: 'tutor' | 'own'
  tags: string[]
  created: number
  updated: number
  files: Omit<PlanFile, 'plan_id'>[]
}

const ID = /^[a-f0-9]{16}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Тип документа по началу файла: PDF, Word (.docx — архив со словом `word/`, .doc — старый формат). Картинки определяет sniff. */
function sniffDoc(b: Buffer, name: string): { mime: string; ext: string } | null {
  if (b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' }
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 && /\.docx$/i.test(name) && b.includes('word/')) {
    return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' }
  }
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && /\.doc$/i.test(name)) return { mime: 'application/msword', ext: 'doc' }
  return null
}

@Injectable()
export class PlansService {
  constructor(
    private readonly db: Db,
    private readonly events: Events,
  ) {
    mkdirSync(DOCS, { recursive: true })
    mkdirSync(THUMBS, { recursive: true })
  }

  private filePath = (f: Pick<PlanFile, 'id' | 'ext'>) => path.join(DOCS, `${f.id}.${f.ext}`)
  private thumbPath = (id: string) => path.join(THUMBS, `${id}.webp`)

  /** Все записи с файлами, новые даты сверху. */
  list() {
    const files = this.db.all<PlanFile>('SELECT * FROM plan_files ORDER BY created')
    const byPlan = new Map<string, Plan['files']>()
    for (const { plan_id, ...f } of files) byPlan.set(plan_id, [...(byPlan.get(plan_id) ?? []), f])
    const items = this.db
      .all<Omit<Plan, 'tags' | 'files'> & { tags: string }>('SELECT id, day, time, title, text, kind, tags, created, updated FROM plans ORDER BY day DESC, time DESC, created DESC')
      .map(p => ({ ...p, tags: readTags(p.tags), files: byPlan.get(p.id) ?? [] }))
    return { items, used: this.usedBytes(), limit: MAX_DOCS_TOTAL }
  }

  private usedBytes() {
    return this.db.get<{ n: number | null }>('SELECT SUM(size) AS n FROM plan_files')?.n ?? 0
  }

  private fields(body: Record<string, unknown> | undefined, partial: boolean) {
    const b = body ?? {}
    const out: { day?: string; time?: string; title?: string; text?: string; kind?: string; tags?: string[] } = {}
    if (!partial || b.day !== undefined) {
      if (typeof b.day !== 'string' || !DAY.test(b.day) || Number.isNaN(Date.parse(b.day))) throw new BadRequestException({ error: 'invalid day' })
      out.day = b.day
    }
    if (b.time !== undefined) {
      if (typeof b.time !== 'string' || (b.time !== '' && !TIME.test(b.time))) throw new BadRequestException({ error: 'invalid time' })
      out.time = b.time
    }
    if (!partial || b.title !== undefined) {
      if (typeof b.title !== 'string' || b.title.length > MAX_PLAN_TITLE) throw new BadRequestException({ error: 'invalid title' })
      out.title = b.title.trim() || 'Без названия'
    }
    if (b.text !== undefined) {
      if (typeof b.text !== 'string' || b.text.length > MAX_PLAN_TEXT) throw new BadRequestException({ error: 'invalid text' })
      out.text = b.text.trim()
    }
    if (b.kind !== undefined) {
      if (b.kind !== 'tutor' && b.kind !== 'own') throw new BadRequestException({ error: 'invalid kind' })
      out.kind = b.kind
    }
    if (b.tags !== undefined) {
      const tags = parseTags(b.tags)
      if (!tags) throw new BadRequestException({ error: 'invalid tags' })
      out.tags = tags
    }
    return out
  }

  create(body: Record<string, unknown> | undefined) {
    const f = this.fields(body, false)
    if (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM plans')!.n >= MAX_PLANS) throw new BadRequestException({ error: 'too many plans' })
    const now = Date.now()
    const id = randomBytes(8).toString('hex')
    this.db.run('INSERT INTO plans (id, day, time, title, text, kind, tags, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, f.day!, f.time ?? '', f.title!, f.text ?? '', f.kind ?? 'own', JSON.stringify(f.tags ?? []), now, now)
    return this.get(id)
  }

  private get(id: string): Plan {
    const row = ID.test(id) ? this.db.get<Omit<Plan, 'tags' | 'files'> & { tags: string }>('SELECT id, day, time, title, text, kind, tags, created, updated FROM plans WHERE id = ?', id) : undefined
    if (!row) throw new NotFoundException({ error: 'not found' })
    const files = this.db.all<PlanFile>('SELECT * FROM plan_files WHERE plan_id = ? ORDER BY created', id).map(({ plan_id: _p, ...f }) => f)
    return { ...row, tags: readTags(row.tags), files }
  }

  update(id: string, body: Record<string, unknown> | undefined) {
    this.get(id)
    const f = this.fields(body, true)
    if (!Object.keys(f).length) throw new BadRequestException({ error: 'empty patch' })
    const sets = Object.keys(f).map(k => `${k} = ?`)
    const vals = Object.entries(f).map(([, v]) => (Array.isArray(v) ? JSON.stringify(v) : (v as string)))
    this.db.run(`UPDATE plans SET ${sets.join(', ')}, updated = ? WHERE id = ?`, ...vals, Date.now(), id)
    return this.get(id)
  }

  async remove(id: string) {
    this.get(id)
    const files = this.db.all<PlanFile>('SELECT * FROM plan_files WHERE plan_id = ?', id)
    this.db.tx(() => {
      this.db.run('DELETE FROM plan_files WHERE plan_id = ?', id)
      this.db.run('DELETE FROM plans WHERE id = ?', id)
    })
    await Promise.all(files.flatMap(f => this.unlinkFiles(f)))
    return { ok: true }
  }

  private unlinkFiles(f: PlanFile) {
    return [this.filePath(f), this.thumbPath(f.id)].map(p => unlink(p).catch(() => undefined))
  }

  /** Прикрепляет файл к записи: проверка типа по содержимому, лимиты, миниатюра для картинок. */
  async addFile(planId: string, file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    this.get(planId)
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'no file' })
    const name = Buffer.from(file.originalname || 'file', 'latin1').toString('utf8').replace(/[\\/\0]/g, '_').slice(0, 200)
    const image = sniff(file.buffer)
    const type = image ?? sniffDoc(file.buffer, name)
    if (!type) throw new BadRequestException({ error: 'unsupported type' })
    if (this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM plan_files WHERE plan_id = ?', planId)!.n >= MAX_PLAN_FILES) throw new BadRequestException({ error: 'too many files' })
    if (this.usedBytes() + file.size > MAX_DOCS_TOTAL) throw new PayloadTooLargeException({ error: 'quota exceeded' })

    const id = randomBytes(8).toString('hex')
    let thumb = 0
    if (image) {
      try {
        const buf = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
        await writeFile(this.thumbPath(id), buf)
        thumb = 1
      } catch {
        throw new BadRequestException({ error: 'broken image' })
      }
    }
    const row: PlanFile = { id, plan_id: planId, name, mime: type.mime, ext: type.ext, size: file.size, thumb, created: Date.now() }
    await writeFile(this.filePath(row), file.buffer)
    this.db.run('INSERT INTO plan_files (id, plan_id, name, mime, ext, size, thumb, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', row.id, row.plan_id, row.name, row.mime, row.ext, row.size, row.thumb, row.created)
    this.events.log('plan_file_added', `${name}, ${Math.round(file.size / 1024)} КБ`)
    const { plan_id: _p, ...out } = row
    return out
  }

  private findFile(id: string): PlanFile {
    const row = ID.test(id) ? this.db.get<PlanFile>('SELECT * FROM plan_files WHERE id = ?', id) : undefined
    if (!row) throw new NotFoundException({ error: 'not found' })
    return row
  }

  /** Путь и тип для скачивания файла или миниатюры. */
  open(id: string, kind: 'file' | 'thumb') {
    const f = this.findFile(id)
    if (kind === 'thumb' && !f.thumb) throw new NotFoundException({ error: 'no thumb' })
    const p = kind === 'file' ? this.filePath(f) : this.thumbPath(f.id)
    if (!existsSync(p)) throw new NotFoundException({ error: 'file missing' })
    return { path: p, mime: kind === 'file' ? f.mime : 'image/webp', name: f.name, image: f.mime.startsWith('image/') }
  }

  async removeFile(id: string) {
    const f = this.findFile(id)
    this.db.run('DELETE FROM plan_files WHERE id = ?', id)
    await Promise.all(this.unlinkFiles(f))
    this.events.log('plan_file_deleted', f.name)
    return { ok: true }
  }
}
