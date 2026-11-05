/** Подмена картинок сайта (режим редактирования): владелец меняет картинку, и она меняется у всех посетителей. Ключ картинки — имя её файла в `src/assets` без хэша. */
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { MAX_SITE_IMAGE, MAX_SITE_IMAGES, SITE_DIR } from '../config.js'
import { Db } from '../db/db.service.js'
import { sniff } from '../images/images.service.js'

interface Row {
  key: string
  kind: string
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
  async list() {
    const items: Record<string, { src: string; x: number; y: number; zoom: number }> = {}
    for (const r of await (await this.db.orm()).siteImage.findMany({ orderBy: { key: 'asc' } }) as Row[]) items[r.key] = { src: this.src(r), x: r.x, y: r.y, zoom: r.zoom }
    return { items }
  }

  private async row(key: string) {
    return (await (await this.db.orm()).siteImage.findUnique({ where: { key } }) as Row | null) ?? undefined
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

  private async guardCount(key: string) {
    if (!(await this.row(key)) && await (await this.db.orm()).siteImage.count() >= MAX_SITE_IMAGES) throw new BadRequestException({ error: 'too many images' })
  }

  /** Загрузка файла: тип по содержимому, сжимается до 1600 px и сохраняется как webp (картинки с прозрачностью остаются прозрачными). */
  async setFile(key: string, file: Express.Multer.File | undefined) {
    this.check(key)
    if (!file) throw new BadRequestException({ error: 'no file' })
    if (file.size > MAX_SITE_IMAGE) throw new PayloadTooLargeException({ error: 'file too large' })
    if (!sniff(file.buffer)) throw new BadRequestException({ error: 'not an image' })
    await this.guardCount(key)
    let out: Buffer
    try {
      out = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate().resize(SIDE, SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
    } catch {
      throw new BadRequestException({ error: 'bad image' })
    }
    const prev = await this.row(key)
    const v = (prev?.v ?? 0) + 1
    const name = `${key}-${v}.webp`
    writeFileSync(path.join(SITE_DIR, name), out)
    this.dropFile(prev)
    await (await this.db.orm()).siteImage.upsert({
      where: { key },
      create: { key, kind: 'file', ref: name, mime: 'image/webp', x: 50, y: 50, zoom: 1, v },
      update: { kind: 'file', ref: name, mime: 'image/webp', x: 50, y: 50, zoom: 1, v },
    })
    return (await this.list()).items[key]
  }

  /** Ссылка на картинку (только https) и/или положение: x, y в процентах, zoom от 1 до 3. */
  async set(key: string, body: { url?: unknown; x?: unknown; y?: unknown; zoom?: unknown } | undefined) {
    this.check(key)
    const b = body ?? {}
    const prev = await this.row(key)
    if (b.url !== undefined) {
      if (typeof b.url !== 'string' || b.url.length > 600 || !/^https:\/\/[^\s]+$/i.test(b.url)) throw new BadRequestException({ error: 'invalid url' })
      await this.guardCount(key)
      this.dropFile(prev)
      await (await this.db.orm()).siteImage.upsert({
        where: { key },
        create: { key, kind: 'url', ref: b.url, mime: '', x: num(b.x, 0, 100, 50), y: num(b.y, 0, 100, 50), zoom: num(b.zoom, 1, 3, 1), v: 1 },
        update: { kind: 'url', ref: b.url, mime: '', x: num(b.x, 0, 100, 50), y: num(b.y, 0, 100, 50), zoom: num(b.zoom, 1, 3, 1), v: { increment: 1 } },
      })
    } else if (!prev) {
      await this.guardCount(key)
      await (await this.db.orm()).siteImage.create({ data: { key, kind: 'none', ref: '', mime: '', x: num(b.x, 0, 100, 50), y: num(b.y, 0, 100, 50), zoom: num(b.zoom, 1, 3, 1), v: 1 } })
    } else {
      await (await this.db.orm()).siteImage.update({ where: { key }, data: { x: num(b.x, 0, 100, prev.x), y: num(b.y, 0, 100, prev.y), zoom: num(b.zoom, 1, 3, prev.zoom) } })
    }
    return (await this.list()).items[key]
  }

  /** Вернуть исходную картинку сайта. */
  async remove(key: string) {
    this.check(key)
    const prev = await this.row(key)
    if (!prev) throw new NotFoundException({ error: 'not found' })
    this.dropFile(prev)
    await (await this.db.orm()).siteImage.delete({ where: { key } })
    return { ok: true }
  }

  async open(key: string) {
    this.check(key)
    const r = await this.row(key)
    const p = r && r.kind === 'file' ? path.join(SITE_DIR, r.ref) : ''
    if (!r || !p || !existsSync(p)) throw new NotFoundException({ error: 'not found' })
    return { path: p, mime: r.mime }
  }
}
