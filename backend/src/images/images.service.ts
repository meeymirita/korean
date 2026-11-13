/**
 * Картинки владельца. Файлы лежат в DATA_DIR/uploads (оригинал) и DATA_DIR/thumbs (миниатюра), описание в таблице images.
 * Тип файла определяется по началу содержимого, а не по имени; SVG не принимается.
 */
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type Metadata } from 'sharp'
import { MAX_CAPTION, MAX_DESCRIPTION, MAX_IMAGE, MAX_IMAGES_TOTAL, THUMBS, UPLOADS } from '../config.js'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import { parseTags, readTags } from '../tags.js'
import { SearchClient } from '../search/search.client.js'
import { YaDiskService } from '../yadisk/yadisk.service.js'
import { TRASH_DAYS } from '../trash/trash.js'

/** Назначение картинки: «Картинки» в кабинете (gallery), вложение заметки (note), обложка кабинета (cover). Списки у каждого свои. */
export const KINDS = ['gallery', 'note', 'cover'] as const
export type Kind = (typeof KINDS)[number]
/** Неиспользуемую картинку заметки или обложки удаляем не раньше, чем через сутки: она могла быть загружена, но ещё не сохранена (например, заметка не ушла на сервер без связи). */
const ORPHAN_AFTER = 24 * 3600 * 1000

export interface ImageRow {
  kind: Kind
  id: string
  name: string
  caption: string
  description: string
  /** теги без «#» */
  tags: string[]
  mime: string
  ext: string
  size: number
  width: number
  height: number
  created: number
}

const ID = /^[a-f0-9]{16}$/

/** Удаляет картинки заметок и обложки, которыми никто не пользуется (файлы и миниатюры тоже). */
export async function pruneImages(db: Db) {
  const used = new Set<string>()
  for (const n of await (await db.orm()).note.findMany({ select: { images: true } }) as { images: string }[]) {
    try {
      for (const id of JSON.parse(n.images) as string[]) used.add(id)
    } catch {
      /* битый список */
    }
  }
  try {
    const cover = (JSON.parse(await db.getMeta('profile') ?? '{}') as { cover?: string }).cover
    if (cover) used.add(cover)
  } catch {
    /* нет профиля */
  }
  const old = await (await db.orm()).image.findMany({ where: { kind: { not: 'gallery' }, created: { lt: BigInt(Date.now() - ORPHAN_AFTER) } }, select: { id: true, ext: true } }) as { id: string; ext: string }[]
  for (const r of old) {
    if (used.has(r.id)) continue
    await (await db.orm()).image.delete({ where: { id: r.id } })
    for (const p of [path.join(UPLOADS, `${r.id}.${r.ext}`), path.join(THUMBS, `${r.id}.webp`)]) {
      try {
        unlinkSync(p)
      } catch {
        /* файла уже нет */
      }
    }
  }
}

/** Определяет тип по первым байтам: jpeg, png, gif, webp. */
export function sniff(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8') return { mime: 'image/gif', ext: 'gif' }
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

/** Теги при загрузке приходят строкой JSON (multipart); кривое значение даёт пустой список. */
function parseTagsField(v: unknown): string[] {
  if (typeof v !== 'string') return []
  try {
    return parseTags(JSON.parse(v)) ?? []
  } catch {
    return []
  }
}

@Injectable()
export class ImagesService {
  constructor(
    private readonly db: Db,
    private readonly events: Events,
    private readonly search: SearchClient,
    private readonly disk: YaDiskService,
  ) {
    mkdirSync(UPLOADS, { recursive: true })
    mkdirSync(THUMBS, { recursive: true })
  }

  private file = (r: Pick<ImageRow, 'id' | 'ext'>) => path.join(UPLOADS, `${r.id}.${r.ext}`)
  private thumb = (id: string) => path.join(THUMBS, `${id}.webp`)

  /** Занятое место считается по всем картинкам, а в списке только выбранного назначения (по умолчанию «Картинки»). */
  async list(kind: unknown = 'gallery') {
    const k: Kind = KINDS.includes(kind as Kind) ? (kind as Kind) : 'gallery'
    const rows = await (await this.db.orm()).image.findMany({ where: { kind: k, deletedAt: null }, orderBy: [{ created: 'desc' }, { id: 'desc' }] })
    const items = rows.map(({ deletedAt: _d, ...r }) => ({ ...r, size: Number(r.size), created: Number(r.created), tags: readTags(r.tags) }))
    return { items, used: await this.usedBytes(), limit: MAX_IMAGES_TOTAL, maxFile: MAX_IMAGE }
  }

  /** Корзина «Картинок»: убранные картинки, свежие сверху; `deletedAt` в мс, `days` срок хранения. Файлы лежат на месте. */
  async trash() {
    const rows = await (await this.db.orm()).image.findMany({ where: { kind: 'gallery', deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
    return { days: TRASH_DAYS, items: rows.map(r => ({ ...r, size: Number(r.size), created: Number(r.created), tags: readTags(r.tags), deletedAt: Number(r.deletedAt) })) }
  }

  private async usedBytes() {
    const result = await (await this.db.orm()).image.aggregate({ _sum: { size: true } }) as { _sum: { size: bigint | null } }
    return Number(result._sum.size ?? 0n)
  }

  /** Сохраняет загруженный файл: проверка типа и целостности, миниатюра, запись в базу. */
  async add(file: { buffer: Buffer; originalname: string; size: number } | undefined, caption: unknown, description?: unknown, kind?: unknown, tags?: unknown) {
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'no file' })
    const type = sniff(file.buffer)
    if (!type) throw new BadRequestException({ error: 'unsupported type' })
    const used = await this.usedBytes()
    if (used + file.size > MAX_IMAGES_TOTAL) throw new PayloadTooLargeException({ error: 'quota exceeded' })

    let meta: Metadata
    let thumb: Buffer
    try {
      const img = sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }) // защита от «бомб» (маленький файл с огромным разрешением)
      meta = await img.metadata()
      thumb = await img.rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
    } catch {
      throw new BadRequestException({ error: 'broken image' })
    }

    const id = randomBytes(8).toString('hex')
    const name = Buffer.from(file.originalname || 'image', 'latin1').toString('utf8').replace(/[\\/\0]/g, '_').slice(0, 200) // multer отдаёт имя в latin1
    const row: ImageRow = {
      id,
      kind: KINDS.includes(kind as Kind) ? (kind as Kind) : 'gallery',
      name,
      caption: typeof caption === 'string' ? caption.trim().slice(0, MAX_CAPTION) : '',
      description: typeof description === 'string' ? description.trim().slice(0, MAX_DESCRIPTION) : '',
      tags: parseTagsField(tags),
      mime: type.mime,
      ext: type.ext,
      size: file.size,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      created: Date.now(),
    }
    await writeFile(this.file(row), file.buffer)
    await writeFile(this.thumb(id), thumb)
    this.disk.mirror(this.file(row))
    await (await this.db.orm()).image.create({ data: { ...row, tags: JSON.stringify(row.tags), size: BigInt(row.size), created: BigInt(row.created) } })
    await this.events.log('image_added', `${name}, ${Math.round(file.size / 1024)} КБ`)
    this.search.schedulePrivateReindex()
    return row
  }

  private async find(id: string): Promise<ImageRow> {
    const raw = ID.test(id) ? await (await this.db.orm()).image.findUnique({ where: { id } }) : null
    const row = raw ? { ...raw, size: Number(raw.size), created: Number(raw.created), tags: readTags(raw.tags) } as ImageRow : undefined
    if (!row) throw new NotFoundException({ error: 'not found' })
    return row
  }

  /** Путь к оригиналу или миниатюре и тип для ответа. */
  async open(id: string, kind: 'file' | 'thumb') {
    const row = await this.find(id)
    const p = kind === 'file' ? this.file(row) : this.thumb(row.id)
    if (!existsSync(p) && !(kind === 'file' && await this.disk.restore(p))) throw new NotFoundException({ error: 'file missing' })
    return { path: p, mime: kind === 'file' ? row.mime : 'image/webp', name: row.name }
  }

  /** Меняет название (caption), описание и/или теги; передавать можно любое из полей. */
  async update(id: string, body: { caption?: unknown; description?: unknown; tags?: unknown }) {
    await this.find(id)
    const { caption, description, tags } = body ?? {}
    if (caption === undefined && description === undefined && tags === undefined) throw new BadRequestException({ error: 'invalid caption' })
    const data: { caption?: string; description?: string; tags?: string } = {}
    if (caption !== undefined) {
      if (typeof caption !== 'string' || caption.length > MAX_CAPTION) throw new BadRequestException({ error: 'invalid caption' })
      data.caption = caption.trim()
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) throw new BadRequestException({ error: 'invalid description' })
      data.description = description.trim()
    }
    if (tags !== undefined) {
      const list = parseTags(tags)
      if (!list) throw new BadRequestException({ error: 'invalid tags' })
      data.tags = JSON.stringify(list)
    }
    await (await this.db.orm()).image.update({ where: { id }, data })
    this.search.schedulePrivateReindex()
    return { ok: true }
  }

  /** Файлы и запись картинки стираются насовсем (в том числе зеркало на Диске). */
  private async erase(row: Pick<ImageRow, 'id' | 'ext' | 'name'>) {
    await (await this.db.orm()).image.delete({ where: { id: row.id } })
    await Promise.all([this.file(row), this.thumb(row.id)].map(p => unlink(p).catch(() => undefined)))
    this.disk.unmirror(this.file(row))
    await this.events.log('image_deleted', row.name)
    this.search.schedulePrivateReindex()
  }

  /** Картинка «Картинок» уходит в корзину на 30 дней: файлы, миниатюра и копия на Диске остаются. Вложения заметок и обложки стираются сразу, как раньше. */
  async remove(id: string) {
    const row = await this.find(id)
    if (row.kind !== 'gallery') {
      await this.erase(row)
      return { ok: true }
    }
    await (await this.db.orm()).image.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: BigInt(Date.now()) } })
    await this.events.log('image_trashed', row.name)
    this.search.schedulePrivateReindex()
    return { ok: true, trashed: true }
  }

  private async inTrash(id: string) {
    const row = await this.find(id)
    const raw = await (await this.db.orm()).image.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } })
    if (!raw) throw new NotFoundException({ error: 'not found' })
    return row
  }

  async restore(id: string) {
    const row = await this.inTrash(id)
    await (await this.db.orm()).image.update({ where: { id }, data: { deletedAt: null } })
    await this.events.log('image_restored', row.name)
    this.search.schedulePrivateReindex()
    return { ok: true }
  }

  /** Удалить из корзины насовсем (вызывающий уже проверил повторный токен). */
  async purge(id: string) {
    await this.erase(await this.inTrash(id))
    return { ok: true }
  }

  /** Автоочистка: стирает картинки, убранные в корзину не позже `cutoff` (мс). Возвращает число стёртых. */
  async purgeOlderThan(cutoff: number) {
    const old = await (await this.db.orm()).image.findMany({ where: { deletedAt: { not: null, lte: BigInt(cutoff) } }, select: { id: true, ext: true, name: true } })
    for (const r of old) await this.erase(r)
    return old.length
  }
}
