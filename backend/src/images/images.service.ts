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
import { MAX_CAPTION, MAX_DESCRIPTION, MAX_IMAGE, MAX_IMAGES_TOTAL, THUMBS, UPLOADS } from '../config'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'
import { parseTags, readTags } from '../tags'

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
export function pruneImages(db: Db) {
  const used = new Set<string>()
  for (const n of db.all<{ images: string }>('SELECT images FROM notes')) {
    try {
      for (const id of JSON.parse(n.images) as string[]) used.add(id)
    } catch {
      /* битый список */
    }
  }
  try {
    const cover = (JSON.parse(db.getMeta('profile') ?? '{}') as { cover?: string }).cover
    if (cover) used.add(cover)
  } catch {
    /* нет профиля */
  }
  const old = db.all<{ id: string; ext: string }>("SELECT id, ext FROM images WHERE kind != 'gallery' AND created < ?", Date.now() - ORPHAN_AFTER)
  for (const r of old) {
    if (used.has(r.id)) continue
    db.run('DELETE FROM images WHERE id = ?', r.id)
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
  ) {
    mkdirSync(UPLOADS, { recursive: true })
    mkdirSync(THUMBS, { recursive: true })
  }

  private file = (r: Pick<ImageRow, 'id' | 'ext'>) => path.join(UPLOADS, `${r.id}.${r.ext}`)
  private thumb = (id: string) => path.join(THUMBS, `${id}.webp`)

  /** Занятое место считается по всем картинкам, а в списке только выбранного назначения (по умолчанию «Картинки»). */
  list(kind: unknown = 'gallery') {
    const k: Kind = KINDS.includes(kind as Kind) ? (kind as Kind) : 'gallery'
    const items = this.db
      .all<Omit<ImageRow, 'tags'> & { tags: string }>(
        'SELECT id, kind, name, caption, description, tags, mime, ext, size, width, height, created FROM images WHERE kind = ? ORDER BY created DESC, id DESC',
        k,
      )
      .map(r => ({ ...r, tags: readTags(r.tags) }))
    return { items, used: this.usedBytes(), limit: MAX_IMAGES_TOTAL, maxFile: MAX_IMAGE }
  }

  private usedBytes() {
    return this.db.get<{ n: number | null }>('SELECT SUM(size) AS n FROM images')?.n ?? 0
  }

  /** Сохраняет загруженный файл: проверка типа и целостности, миниатюра, запись в базу. */
  async add(file: { buffer: Buffer; originalname: string; size: number } | undefined, caption: unknown, description?: unknown, kind?: unknown, tags?: unknown) {
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'no file' })
    const type = sniff(file.buffer)
    if (!type) throw new BadRequestException({ error: 'unsupported type' })
    const used = this.usedBytes()
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
    this.db.run(
      'INSERT INTO images (id, kind, name, caption, description, tags, mime, ext, size, width, height, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id, row.kind, row.name, row.caption, row.description, JSON.stringify(row.tags), row.mime, row.ext, row.size, row.width, row.height, row.created,
    )
    this.events.log('image_added', `${name}, ${Math.round(file.size / 1024)} КБ`)
    return row
  }

  private find(id: string): ImageRow {
    const row = ID.test(id) ? this.db.get<ImageRow>('SELECT * FROM images WHERE id = ?', id) : undefined
    if (!row) throw new NotFoundException({ error: 'not found' })
    return row
  }

  /** Путь к оригиналу или миниатюре и тип для ответа. */
  open(id: string, kind: 'file' | 'thumb') {
    const row = this.find(id)
    const p = kind === 'file' ? this.file(row) : this.thumb(row.id)
    if (!existsSync(p)) throw new NotFoundException({ error: 'file missing' })
    return { path: p, mime: kind === 'file' ? row.mime : 'image/webp', name: row.name }
  }

  /** Меняет название (caption), описание и/или теги; передавать можно любое из полей. */
  update(id: string, body: { caption?: unknown; description?: unknown; tags?: unknown }) {
    this.find(id)
    const { caption, description, tags } = body ?? {}
    if (caption === undefined && description === undefined && tags === undefined) throw new BadRequestException({ error: 'invalid caption' })
    if (caption !== undefined) {
      if (typeof caption !== 'string' || caption.length > MAX_CAPTION) throw new BadRequestException({ error: 'invalid caption' })
      this.db.run('UPDATE images SET caption = ? WHERE id = ?', caption.trim(), id)
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) throw new BadRequestException({ error: 'invalid description' })
      this.db.run('UPDATE images SET description = ? WHERE id = ?', description.trim(), id)
    }
    if (tags !== undefined) {
      const list = parseTags(tags)
      if (!list) throw new BadRequestException({ error: 'invalid tags' })
      this.db.run('UPDATE images SET tags = ? WHERE id = ?', JSON.stringify(list), id)
    }
    return { ok: true }
  }

  async remove(id: string) {
    const row = this.find(id)
    this.db.run('DELETE FROM images WHERE id = ?', id)
    await Promise.all([this.file(row), this.thumb(id)].map(p => unlink(p).catch(() => undefined)))
    this.events.log('image_deleted', row.name)
    return { ok: true }
  }
}
