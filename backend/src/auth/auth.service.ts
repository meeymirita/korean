import { Injectable } from '@nestjs/common'
import { createHash, timingSafeEqual } from 'node:crypto'
import { TOKEN } from '../config.js'
import { Db } from '../db/db.service.js'
import type { Who } from './auth.js'
import { TwoFaService, ownerSessionHours } from './twofa.service.js'

const sha = (text: string) => createHash('sha256').update(text).digest()
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

/** Ключ в таблице `meta`: хэш и срок временного токена входящих. */
export const INBOX_META = 'inbox_token'

export const hashToken = (token: string) => sha(token).toString('hex')

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly twofa: TwoFaService,
  ) {}

  /** Совпадает ли строка с токеном владельца (сравнение без утечки по времени). */
  isOwnerToken(given: string): boolean {
    return given.length > 0 && given.length <= 200 && same(Buffer.from(given), Buffer.from(TOKEN))
  }

  /** Временный токен входящих (создаётся кнопкой в шторке «Новые слова», живёт 10 минут, хранится хэшем в `meta`). */
  async isInboxToken(header?: string): Promise<boolean> {
    const given = (header || '').replace(/^Bearer\s+/i, '')
    if (!given || given.length > 200) return false
    const raw = await this.db.getMeta(INBOX_META)
    if (!raw) return false
    try {
      const { h, exp } = JSON.parse(raw) as { h: string; exp: number }
      return typeof exp === 'number' && exp > Date.now() && same(sha(given), Buffer.from(h, 'hex'))
    } catch {
      return false
    }
  }

  /** По заголовку Authorization: Bearer … определяет, кто пришёл. 'expired' — гостевой токен просрочен, null — токен не подошёл. */
  async whoIs(header?: string): Promise<Who | 'expired' | null> {
    const given = (header || '').replace(/^Bearer\s+/i, '')
    if (!given || given.length > 300) return null // длинную строку даже не хэшируем
    // владелец: «токен» или, после двухфакторного входа, «токен сеанс» (через пробел)
    if (TOKEN && given.length >= TOKEN.length && same(Buffer.from(given.slice(0, TOKEN.length)), Buffer.from(TOKEN))) {
      const rest = given.slice(TOKEN.length)
      if (rest === '' || rest.startsWith(' ')) {
        if ((!await this.twofa.required() && ownerSessionHours() === 0) || await this.twofa.validSession(rest.slice(1))) return { role: 'owner' }
        return { role: 'owner', pending: true }
      }
    }
    if (given.length > 200) return null
    const hash = sha(given).toString('hex')
    const guest = await (await this.db.orm()).guest.findFirst({ where: { hash }, select: { id: true, expires: true } })
    const expires = guest ? Number(guest.expires) : 0
    return guest ? expires <= Date.now() ? 'expired' : { role: 'guest', id: guest.id, expires } : null
  }
}
