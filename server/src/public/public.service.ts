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
import { MAX_OG, PUBLIC_DIR, UPLOADS } from '../config'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'

export interface Card {
  name: string
  avatar: string
  level: number
  title: string
  streak: number
  learned: number
  answers: number
  /** дней с начала пути */
  days: number
}

interface Settings {
  enabled: boolean
  /** id обложки кабинета, которую разрешено показывать всем; пусто — не показывать */
  cover: string
  card: Card | null
  updated: number
}

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

  private read(): Settings {
    try {
      const v = JSON.parse(this.db.getMeta('public') ?? '{}') as Partial<Settings>
      return { enabled: v.enabled === true, cover: typeof v.cover === 'string' && ID.test(v.cover) ? v.cover : '', card: v.card ? cleanCard(v.card) : null, updated: Number(v.updated) || 0 }
    } catch {
      return { enabled: false, cover: '', card: null, updated: 0 }
    }
  }

  /** Для владельца: что включено и есть ли картинка превью. */
  settings() {
    const s = this.read()
    return { enabled: s.enabled, cover: s.cover, hasOg: existsSync(OG_FILE), updated: s.updated }
  }

  save(body: { enabled?: unknown; cover?: unknown; card?: unknown } | undefined) {
    const b = body ?? {}
    if (typeof b.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid settings' })
    const was = this.read()
    let cover = ''
    if (b.cover !== undefined && b.cover !== '') {
      if (typeof b.cover !== 'string' || !ID.test(b.cover) || !this.db.get("SELECT 1 AS x FROM images WHERE id = ? AND kind = 'cover'", b.cover)) throw new BadRequestException({ error: 'invalid cover' })
      cover = b.cover
    }
    const next: Settings = { enabled: b.enabled, cover, card: b.card === undefined ? was.card : cleanCard(b.card), updated: Date.now() }
    this.db.setMeta('public', JSON.stringify(next))
    if (was.enabled !== next.enabled) this.events.log(next.enabled ? 'public_on' : 'public_off', '/me')
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
  publicCard() {
    const s = this.read()
    if (!s.enabled || !s.card) throw new NotFoundException({ error: 'closed' })
    return { ...s.card, cover: !!s.cover, hasOg: existsSync(OG_FILE), updated: s.updated }
  }

  publicOg() {
    if (!this.read().enabled || !existsSync(OG_FILE)) throw new NotFoundException({ error: 'closed' })
    return OG_FILE
  }

  /** Обложка: только та, что владелец явно разрешил, и только пока визитка включена. */
  publicCover() {
    const s = this.read()
    if (!s.enabled || !s.cover) throw new NotFoundException({ error: 'closed' })
    const row = this.db.get<{ ext: string; mime: string }>("SELECT ext, mime FROM images WHERE id = ? AND kind = 'cover'", s.cover)
    const p = row ? path.join(UPLOADS, `${s.cover}.${row.ext}`) : ''
    if (!row || !existsSync(p)) throw new NotFoundException({ error: 'closed' })
    return { path: p, mime: row.mime }
  }
}
