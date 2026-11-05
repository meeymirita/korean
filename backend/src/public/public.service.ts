/**
 * Публичная визитка: страница /me, которую владелец может включить и выключить.
 * Пока визитка закрыта, все открытые маршруты отвечают 404. Наружу идёт только короткая белая выборка полей (имя, уровень, серия…),
 * картинка для превью ссылки (1200×630, её рисует сайт) и обложка кабинета, если владелец разрешил её показывать.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { MAX_OG, PUBLIC_DIR, UPLOADS } from '../config.js'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import { Card, Settings } from './public.types.js'

const ID = /^[a-f0-9]{16}$/
const OG_FILE = path.join(PUBLIC_DIR, 'og.png')
const int = (v: unknown, max = 1_000_000) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Белая выборка полей: всё остальное из тела запроса отбрасывается. */
export function cleanCard(v: unknown): Card {
  const c = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const avatar = str(c.avatar, 30_000)
  return {
    name: str(c.name, 24).trim(),
    // эмодзи (коротко) или своя картинка из профиля; всё остальное не показываем
    avatar: avatar.length <= 16 || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) ? avatar : '',
    level: int(c.level, 999),
    title: str(c.title, 40),
    streak: int(c.streak, 100_000),
    learned: int(c.learned),
    answers: int(c.answers),
    days: int(c.days, 100_000),
  }
}

@Injectable()
export class PublicService {
  constructor(
    private readonly db: Db,
    private readonly events: Events,
  ) {
    mkdirSync(PUBLIC_DIR, { recursive: true })
  }

  private async read(): Promise<Settings> {
    try {
      const v = JSON.parse(await this.db.getMeta('public') ?? '{}') as Partial<Settings>
      return { enabled: v.enabled === true, cover: typeof v.cover === 'string' && ID.test(v.cover) ? v.cover : '', card: v.card ? cleanCard(v.card) : null, updated: Number(v.updated) || 0 }
    } catch {
      return { enabled: false, cover: '', card: null, updated: 0 }
    }
  }

  /** Для владельца: что включено и есть ли картинка превью. */
  async settings() {
    const s = await this.read()
    return { enabled: s.enabled, cover: s.cover, hasOg: existsSync(OG_FILE), updated: s.updated }
  }

  async save(body: { enabled?: unknown; cover?: unknown; card?: unknown } | undefined) {
    const b = body ?? {}
    if (typeof b.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid settings' })
    const was = await this.read()
    let cover = ''
    if (b.cover !== undefined && b.cover !== '') {
      const coverImage = typeof b.cover === 'string' && ID.test(b.cover)
        ? await (await this.db.orm()).image.findFirst({ where: { id: b.cover, kind: 'cover' }, select: { id: true } })
        : null
      if (!coverImage) throw new BadRequestException({ error: 'invalid cover' })
      cover = b.cover as string
    }
    const next: Settings = { enabled: b.enabled, cover, card: b.card === undefined ? was.card : cleanCard(b.card), updated: Date.now() }
    await this.db.setMeta('public', JSON.stringify(next))
    if (was.enabled !== next.enabled) await this.events.log(next.enabled ? 'public_on' : 'public_off', '/me')
    return this.settings()
  }

  /** Картинка превью ссылки: PNG ровно 1200×630. */
  async saveOg(file: { buffer: Buffer } | undefined) {
    if (!file?.buffer?.length || file.buffer.length > MAX_OG) throw new BadRequestException({ error: 'invalid image' })
    try {
      const m = await sharp(file.buffer, { failOn: 'error' }).metadata()
      if (m.format !== 'png' || m.width !== 1200 || m.height !== 630) throw new Error('size')
    } catch {
      throw new BadRequestException({ error: 'invalid image' })
    }
    await writeFile(OG_FILE, file.buffer)
    return this.settings()
  }

  /** Открытые данные визитки; пока закрыта — 404. */
  async publicCard() {
    const s = await this.read()
    if (!s.enabled || !s.card) throw new NotFoundException({ error: 'closed' })
    return { ...s.card, cover: !!s.cover, hasOg: existsSync(OG_FILE), updated: s.updated }
  }

  async publicOg() {
    if (!(await this.read()).enabled || !existsSync(OG_FILE)) throw new NotFoundException({ error: 'closed' })
    return OG_FILE
  }

  /** Обложка: только та, что владелец явно разрешил, и только пока визитка включена. */
  async publicCover() {
    const s = await this.read()
    if (!s.enabled || !s.cover) throw new NotFoundException({ error: 'closed' })
    const row = await (await this.db.orm()).image.findFirst({ where: { id: s.cover, kind: 'cover' }, select: { ext: true, mime: true } })
    const p = row ? path.join(UPLOADS, `${s.cover}.${row.ext}`) : ''
    if (!row || !existsSync(p)) throw new NotFoundException({ error: 'closed' })
    return { path: p, mime: row.mime }
  }
}
