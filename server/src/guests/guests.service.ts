/** Гостевые токены: владелец создаёт их на нужное время, гость открывает сайт целиком, но ничего не сохраняет. */
import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { hashToken } from '../auth/auth.service'
import { EXPIRED_KEEP, MAX_GUESTS, MAX_GUEST_HOURS } from '../config'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'

export interface GuestRow {
  id: string
  label: string
  created: number
  expires: number
}

@Injectable()
export class GuestsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly events: Events,
  ) {}

  onModuleInit() {
    this.purge()
    this.timer = setInterval(() => this.purge(), 3600 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /** Убирает записи, просроченные больше суток назад. */
  purge() {
    this.db.run('DELETE FROM guests WHERE expires + ? < ?', EXPIRED_KEEP, Date.now())
  }

  list(): GuestRow[] {
    return this.db.all<GuestRow>('SELECT id, label, created, expires FROM guests WHERE expires > ? ORDER BY created DESC', Date.now())
  }

  create(hours: unknown, label: unknown) {
    const h = Number(hours)
    if (!(h >= 0.1 && h <= MAX_GUEST_HOURS)) throw new BadRequestException({ error: 'invalid hours' })
    this.purge()
    if (this.list().length >= MAX_GUESTS) throw new BadRequestException({ error: 'too many guests' })
    const token = randomBytes(18).toString('base64url')
    const id = randomBytes(4).toString('hex')
    const created = Date.now()
    const name = typeof label === 'string' ? label.trim().slice(0, 40) : ''
    const expires = created + Math.round(h * 3600 * 1000)
    this.db.run('INSERT INTO guests (id, hash, label, created, expires) VALUES (?, ?, ?, ?, ?)', id, hashToken(token), name, created, expires)
    this.events.log('guest_created', `${name || id}, ${h} ч`)
    return { id, label: name, created, expires, token }
  }

  revoke(id: string) {
    const row = this.db.get<GuestRow>('SELECT id, label FROM guests WHERE id = ?', id)
    if (!row) throw new NotFoundException({ error: 'not found' })
    this.db.run('DELETE FROM guests WHERE id = ?', id)
    this.events.log('guest_revoked', row.label || id)
  }
}
