/** Подмена картинок сайта (режим редактирования): владелец меняет картинку, и она меняется у всех посетителей. Ключ картинки — имя её файла в `src/assets` без хэша. */
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { MAX_SITE_IMAGE, MAX_SITE_IMAGES, SITE_DIR } from '../config'
import { Db } from '../db/db.service'
import { sniff } from '../images/images.service'

interface Row {
  key: string
  kind: string // file | url | none (исходная картинка, меняется только положение)
  ref: string // имя файла в SITE_DIR или внешняя ссылка
  mime: string
  x: number
  y: number
  zoom: number
  v: number
}

const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i
const SIDE = 1600
const num = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def)

@Injectable()
export class SiteImgService {
  constructor(private readonly db: Db) {
    mkdirSync(SITE_DIR, { recursive: true })
  }

  private check(key: string) {
    if (!KEY.test(key)) throw new BadRequestException({ error: 'invalid key' })
  }

  private src(r: Row) {
    if (r.kind === 'none') return ''
    return r.kind === 'url' ? r.ref : `/api/site-images/file/${r.key}?v=${r.v}`
  }

  /** Все подмены для сайта: открыто всем (картинки видят и посетители без токена). */
  list() {
    const items: Record<string, { src: string; x: number; y: number; zoom: number }> = {}
    for (const r of this.db.all<Row>('SELECT key, kind, ref, mime, x, y, zoom, v FROM site_images ORDER BY key')) items[r.key] = { src: this.src(r), x: r.x, y: r.y, zoom: r.zoom }
    return { items }
  }

  private row(key: string) {
    return this.db.get<Row>('SELECT key, kind, ref, mime, x, y, zoom, v FROM site_images WHERE key = ?', key)
  }

  private dropFile(r: Row | undefined) {
    if (r?.kind === 'file') {
      try {
        unlinkSync(path.join(SITE_DIR, r.ref))
      } catch {
        /* уже нет */
      }
    }
  }

  private guardCount(key: string) {
    if (!this.row(key) && this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM site_images')!.n >= MAX_SITE_IMAGES) throw new BadRequestException({ error: 'too many images' })
  }

  /** Загрузка файла: тип по содержимому, сжимается до 1600 px и сохраняется как webp (картинки с прозрачностью остаются прозрачными). */
  async setFile(key: string, file: Express.Multer.File | undefined) {
    this.check(key)
    if (!file) throw new BadRequestException({ error: 'no file' })
    if (file.size > MAX_SITE_IMAGE) throw new PayloadTooLargeException({ error: 'file too large' })
    if (!sniff(file.buffer)) throw new BadRequestException({ error: 'not an image' })
    this.guardCount(key)
    let out: Buffer
    try {
      out = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate().resize(SIDE, SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
    } catch {
      throw new BadRequestException({ error: 'bad image' })
    }
    const prev = this.row(key)
    const v = (prev?.v ?? 0) + 1
    const name = `${key}-${v}.webp`
    writeFileSync(path.join(SITE_DIR, name), out)
    this.dropFile(prev)
    this.db.run(
      'INSERT INTO site_images (key, kind, ref, mime, x, y, zoom, v) VALUES (?, ?, ?, ?, 50, 50, 1, ?) ON CONFLICT(key) DO UPDATE SET kind = excluded.kind, ref = excluded.ref, mime = excluded.mime, x = 50, y = 50, zoom = 1, v = excluded.v',
      key, 'file', name, 'image/webp', v,
    )
    return this.list().items[key]
  }

  /** Ссылка на картинку (только https) и/или положение: x, y в процентах, zoom от 1 до 3. */
  set(key: string, body: { url?: unknown; x?: unknown; y?: unknown; zoom?: unknown } | undefined) {
    this.check(key)
    const b = body ?? {}
    const prev = this.row(key)
    if (b.url !== undefined) {
      if (typeof b.url !== 'string' || b.url.length > 600 || !/^https:\/\/[^\s]+$/i.test(b.url)) throw new BadRequestException({ error: 'invalid url' })
      this.guardCount(key)
      this.dropFile(prev)
      this.db.run(
        'INSERT INTO site_images (key, kind, ref, mime, x, y, zoom, v) VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(key) DO UPDATE SET kind = excluded.kind, ref = excluded.ref, mime = excluded.mime, x = excluded.x, y = excluded.y, zoom = excluded.zoom, v = site_images.v + 1',
        key, 'url', b.url, '', num(b.x, 0, 100, 50), num(b.y, 0, 100, 50), num(b.zoom, 1, 3, 1),
      )
    } else if (!prev) {
      this.guardCount(key)
      this.db.run('INSERT INTO site_images (key, kind, ref, mime, x, y, zoom, v) VALUES (?, ?, ?, ?, ?, ?, ?, 1)', key, 'none', '', '', num(b.x, 0, 100, 50), num(b.y, 0, 100, 50), num(b.zoom, 1, 3, 1))
    } else {
      this.db.run('UPDATE site_images SET x = ?, y = ?, zoom = ? WHERE key = ?', num(b.x, 0, 100, prev.x), num(b.y, 0, 100, prev.y), num(b.zoom, 1, 3, prev.zoom), key)
    }
    return this.list().items[key]
  }

  /** Вернуть исходную картинку сайта. */
  remove(key: string) {
    this.check(key)
    const prev = this.row(key)
    if (!prev) throw new NotFoundException({ error: 'not found' })
    this.dropFile(prev)
    this.db.run('DELETE FROM site_images WHERE key = ?', key)
    return { ok: true }
  }

  open(key: string) {
    this.check(key)
    const r = this.row(key)
    const p = r && r.kind === 'file' ? path.join(SITE_DIR, r.ref) : ''
    if (!r || !p || !existsSync(p)) throw new NotFoundException({ error: 'not found' })
    return { path: p, mime: r.mime }
  }
}
