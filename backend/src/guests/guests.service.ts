/** Гостевые токены: владелец создаёт их на нужное время, гость открывает сайт целиком, но ничего не сохраняет. */
import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { hashToken } from '../auth/auth.service.js'
import { EXPIRED_KEEP, MAX_GUESTS, MAX_GUEST_HOURS } from '../config.js'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import type { GuestRow } from './guest.types.js'

@Injectable()
export class GuestsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly events: Events,
  ) {}

  onModuleInit() {
    void this.purge()
    this.timer = setInterval(() => void this.purge(), 3600 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /** Убирает записи, просроченные больше суток назад. */
  async purge() {
    await (await this.db.orm()).guest.deleteMany({ where: { expires: { lt: BigInt(Date.now() - EXPIRED_KEEP) } } })
  }

  async list(): Promise<GuestRow[]> {
    const rows = await (await this.db.orm()).guest.findMany({
      where: { expires: { gt: BigInt(Date.now()) } },
      select: { id: true, label: true, created: true, expires: true },
      orderBy: { created: 'desc' },
    })
    return rows.map(row => ({ ...row, created: Number(row.created), expires: Number(row.expires) }))
  }

  async create(hours: unknown, label: unknown) {
    const h = Number(hours)
    if (!(h >= 0.1 && h <= MAX_GUEST_HOURS)) throw new BadRequestException({ error: 'invalid hours' })
    await this.purge()
    if ((await this.list()).length >= MAX_GUESTS) throw new BadRequestException({ error: 'too many guests' })
    const token = randomBytes(18).toString('base64url')
    const id = randomBytes(4).toString('hex')
    const created = Date.now()
    const name = typeof label === 'string' ? label.trim().slice(0, 40) : ''
    const expires = created + Math.round(h * 3600 * 1000)
    await (await this.db.orm()).guest.create({ data: { id, hash: hashToken(token), label: name, created: BigInt(created), expires: BigInt(expires) } })
    await this.events.log('guest_created', `${name || id}, ${h} ч`)
    return { id, label: name, created, expires, token }
  }

  async revoke(id: string) {
    const row = await (await this.db.orm()).guest.findUnique({ where: { id }, select: { id: true, label: true } })
    if (!row) throw new NotFoundException({ error: 'not found' })
    await (await this.db.orm()).guest.delete({ where: { id } })
    await this.events.log('guest_revoked', row.label || id)
  }
}
