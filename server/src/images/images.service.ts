/**
 * Картинки владельца. Файлы лежат в DATA_DIR/uploads (оригинал) и DATA_DIR/thumbs (миниатюра), описание в таблице images.
 * Тип файла определяется по началу содержимого, а не по имени; SVG не принимается.
 */
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type Metadata } from 'sharp'
import { MAX_CAPTION, MAX_IMAGE, MAX_IMAGES_TOTAL, THUMBS, UPLOADS } from '../config'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'

export interface ImageRow {
  id: string
  name: string
  caption: string
  mime: string
  ext: string
  size: number
  width: number
  height: number
  created: number
}

const ID = /^[a-f0-9]{16}$/

/** Определяет тип по первым байтам: jpeg, png, gif, webp. */
function sniff(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8') return { mime: 'image/gif', ext: 'gif' }
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
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

  list() {
    const items = this.db.all<ImageRow>('SELECT id, name, caption, mime, ext, size, width, height, created FROM images ORDER BY created DESC, id DESC')
    const used = items.reduce((n, i) => n + i.size, 0)
    return { items, used, limit: MAX_IMAGES_TOTAL, maxFile: MAX_IMAGE }
  }

  /** Сохраняет загруженный файл: проверка типа и целостности, миниатюра, запись в базу. */
  async add(file: { buffer: Buffer; originalname: string; size: number } | undefined, caption: unknown) {
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'no file' })
    const type = sniff(file.buffer)
    if (!type) throw new BadRequestException({ error: 'unsupported type' })
    const { used } = this.list()
    if (used + file.size > MAX_IMAGES_TOTAL) throw new PayloadTooLargeException({ error: 'quota exceeded' })

    let meta: Metadata
    let thumb: Buffer
    try {
      const img = sharp(file.buffer, { failOn: 'error' })
      meta = await img.metadata()
      thumb = await img.rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
    } catch {
      throw new BadRequestException({ error: 'broken image' })
    }

    const id = randomBytes(8).toString('hex')
    const name = Buffer.from(file.originalname || 'image', 'latin1').toString('utf8').replace(/[\\/\0]/g, '_').slice(0, 200) // multer отдаёт имя в latin1
    const row: ImageRow = {
      id,
      name,
      caption: typeof caption === 'string' ? caption.trim().slice(0, MAX_CAPTION) : '',
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
      'INSERT INTO images (id, name, caption, mime, ext, size, width, height, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id, row.name, row.caption, row.mime, row.ext, row.size, row.width, row.height, row.created,
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

  caption(id: string, caption: unknown) {
    this.find(id)
    if (typeof caption !== 'string' || caption.length > MAX_CAPTION) throw new BadRequestException({ error: 'invalid caption' })
    this.db.run('UPDATE images SET caption = ? WHERE id = ?', caption.trim(), id)
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
