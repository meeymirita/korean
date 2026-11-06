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
import { DOCS, MAX_DOCS_TOTAL, MAX_PLANS, MAX_PLAN_FILES, MAX_PLAN_TEXT, MAX_PLAN_TITLE, THUMBS } from '../config.js'
import { YaDiskService } from '../yadisk/yadisk.service.js'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import { sniff } from '../images/images.service.js'
import { parseTags, readTags } from '../tags.js'

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
    private readonly disk: YaDiskService,
  ) {
    mkdirSync(DOCS, { recursive: true })
    mkdirSync(THUMBS, { recursive: true })
  }

  private filePath = (f: Pick<PlanFile, 'id' | 'ext'>) => path.join(DOCS, `${f.id}.${f.ext}`)
  private thumbPath = (id: string) => path.join(THUMBS, `${id}.webp`)

  /** Все записи с файлами, новые даты сверху. */
  async list() {
    const files = (await (await this.db.orm()).planFile.findMany({ orderBy: { created: 'asc' } }) as (Omit<PlanFile, 'size' | 'created'> & { size: bigint; created: bigint })[])
      .map(file => ({ ...file, size: Number(file.size), created: Number(file.created) }))
    const byPlan = new Map<string, Plan['files']>()
    for (const { plan_id, ...f } of files) byPlan.set(plan_id, [...(byPlan.get(plan_id) ?? []), f])
    const items = (await (await this.db.orm()).plan.findMany({ orderBy: [{ day: 'desc' }, { time: 'desc' }, { created: 'desc' }] }) as (Omit<Plan, 'tags' | 'files' | 'created' | 'updated'> & { tags: string; created: bigint; updated: bigint })[])
      .map(p => ({ ...p, created: Number(p.created), updated: Number(p.updated), tags: readTags(p.tags), files: byPlan.get(p.id) ?? [] }))
    return { items, used: await this.usedBytes(), limit: MAX_DOCS_TOTAL }
  }

  private async usedBytes() {
    const result = await (await this.db.orm()).planFile.aggregate({ _sum: { size: true } }) as { _sum: { size: bigint | null } }
    return Number(result._sum.size ?? 0n)
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

  async create(body: Record<string, unknown> | undefined) {
    const f = this.fields(body, false)
    if (await (await this.db.orm()).plan.count() >= MAX_PLANS) throw new BadRequestException({ error: 'too many plans' })
    const now = Date.now()
    const id = randomBytes(8).toString('hex')
    await (await this.db.orm()).plan.create({ data: { id, day: f.day!, time: f.time ?? '', title: f.title!, text: f.text ?? '', kind: f.kind ?? 'own', tags: JSON.stringify(f.tags ?? []), created: BigInt(now), updated: BigInt(now) } })
    return await this.get(id)
  }

  private async get(id: string): Promise<Plan> {
    const raw = ID.test(id) ? await (await this.db.orm()).plan.findUnique({ where: { id } }) : null
    const row = raw ? { ...raw, created: Number(raw.created), updated: Number(raw.updated) } as Omit<Plan, 'tags' | 'files'> & { tags: string } : undefined
    if (!row) throw new NotFoundException({ error: 'not found' })
    const files = (await (await this.db.orm()).planFile.findMany({ where: { plan_id: id }, orderBy: { created: 'asc' } }) as (Omit<PlanFile, 'size' | 'created'> & { size: bigint; created: bigint })[])
      .map(({ plan_id: _p, ...f }) => ({ ...f, size: Number(f.size), created: Number(f.created) }))
    return { ...row, tags: readTags(row.tags), files }
  }

  async update(id: string, body: Record<string, unknown> | undefined) {
    await this.get(id)
    const f = this.fields(body, true)
    if (!Object.keys(f).length) throw new BadRequestException({ error: 'empty patch' })
    const data = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : value]))
    await (await this.db.orm()).plan.update({ where: { id }, data: { ...data, updated: BigInt(Date.now()) } })
    return await this.get(id)
  }

  async remove(id: string) {
    await this.get(id)
    const files = (await (await this.db.orm()).planFile.findMany({ where: { plan_id: id } }) as (Omit<PlanFile, 'size' | 'created'> & { size: bigint; created: bigint })[])
      .map(file => ({ ...file, size: Number(file.size), created: Number(file.created) }))
    await this.db.tx(async () => {
      const db = await this.db.orm()
      await db.planFile.deleteMany({ where: { plan_id: id } })
      await db.plan.delete({ where: { id } })
    })
    await Promise.all(files.flatMap(f => this.unlinkFiles(f)))
    return { ok: true }
  }

  private unlinkFiles(f: PlanFile) {
    this.disk.unmirror(this.filePath(f))
    return [this.filePath(f), this.thumbPath(f.id)].map(p => unlink(p).catch(() => undefined))
  }

  /** Прикрепляет файл к записи: проверка типа по содержимому, лимиты, миниатюра для картинок. */
  async addFile(planId: string, file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    await this.get(planId)
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'no file' })
    const name = Buffer.from(file.originalname || 'file', 'latin1').toString('utf8').replace(/[\\/\0]/g, '_').slice(0, 200)
    const image = sniff(file.buffer)
    const type = image ?? sniffDoc(file.buffer, name)
    if (!type) throw new BadRequestException({ error: 'unsupported type' })
    if (await (await this.db.orm()).planFile.count({ where: { plan_id: planId } }) >= MAX_PLAN_FILES) throw new BadRequestException({ error: 'too many files' })
    if (await this.usedBytes() + file.size > MAX_DOCS_TOTAL) throw new PayloadTooLargeException({ error: 'quota exceeded' })

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
    this.disk.mirror(this.filePath(row))
    await (await this.db.orm()).planFile.create({ data: { ...row, size: BigInt(row.size), created: BigInt(row.created) } })
    await this.events.log('plan_file_added', `${name}, ${Math.round(file.size / 1024)} КБ`)
    const { plan_id: _p, ...out } = row
    return out
  }

  private async findFile(id: string): Promise<PlanFile> {
    const raw = ID.test(id) ? await (await this.db.orm()).planFile.findUnique({ where: { id } }) : null
    const row = raw ? { ...raw, size: Number(raw.size), created: Number(raw.created) } as PlanFile : undefined
    if (!row) throw new NotFoundException({ error: 'not found' })
    return row
  }

  /** Путь и тип для скачивания файла или миниатюры. */
  async open(id: string, kind: 'file' | 'thumb') {
    const f = await this.findFile(id)
    if (kind === 'thumb' && !f.thumb) throw new NotFoundException({ error: 'no thumb' })
    const p = kind === 'file' ? this.filePath(f) : this.thumbPath(f.id)
    if (!existsSync(p)) throw new NotFoundException({ error: 'file missing' })
    return { path: p, mime: kind === 'file' ? f.mime : 'image/webp', name: f.name, image: f.mime.startsWith('image/') }
  }

  async removeFile(id: string) {
    const f = await this.findFile(id)
    await (await this.db.orm()).planFile.delete({ where: { id } })
    await Promise.all(this.unlinkFiles(f))
    await this.events.log('plan_file_deleted', f.name)
    return { ok: true }
  }
}
