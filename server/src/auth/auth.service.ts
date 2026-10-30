import { Injectable } from '@nestjs/common'
import { createHash, timingSafeEqual } from 'node:crypto'
import { TOKEN } from '../config'
import { Db } from '../db/db.service'
import type { Who } from './auth'
import { TwoFaService } from './twofa.service'

const sha = (text: string) => createHash('sha256').update(text).digest()
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

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

  /** По заголовку Authorization: Bearer … определяет, кто пришёл. 'expired' — гостевой токен просрочен, null — токен не подошёл. */
  whoIs(header?: string): Who | 'expired' | null {
    const given = (header || '').replace(/^Bearer\s+/i, '')
    if (!given || given.length > 300) return null // длинную строку даже не хэшируем
    // владелец: «токен» или, после двухфакторного входа, «токен сеанс» (через пробел)
    if (TOKEN && given.length >= TOKEN.length && same(Buffer.from(given.slice(0, TOKEN.length)), Buffer.from(TOKEN))) {
      const rest = given.slice(TOKEN.length)
      if (rest === '' || rest.startsWith(' ')) {
        if (!this.twofa.required() || this.twofa.validSession(rest.slice(1))) return { role: 'owner' }
        return { role: 'owner', pending: true }
      }
    }
    if (given.length > 200) return null
    const hash = sha(given)
    for (const g of this.db.all<{ id: string; hash: string; expires: number }>('SELECT id, hash, expires FROM guests')) {
      if (same(hash, Buffer.from(g.hash, 'hex'))) return g.expires <= Date.now() ? 'expired' : { role: 'guest', id: g.id, expires: g.expires }
    }
    return null
  }
}
