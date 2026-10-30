import { ForbiddenException, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { Events } from '../events/events.service'
import { RateLimiter, clientIp } from '../security'
import { AuthService } from './auth.service'

/**
 * Повторный ввод токена для опасных действий (сброс прогресса, загрузка копии, создание гостевого токена).
 * Сайт присылает токен в заголовке X-Confirm-Token; даже украденный открытый сеанс без токена этого сделать не сможет.
 * Неверный токен считается попыткой подбора (см. security.ts).
 */
@Injectable()
export class ConfirmService {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
    private readonly events: Events,
  ) {}

  require(req: Request) {
    const given = String(req.headers['x-confirm-token'] ?? '')
    if (given && this.auth.isOwnerToken(given)) return
    const ip = clientIp(req)
    const locked = this.limiter.fail(ip, 'confirm')
    this.events.log(locked ? 'ip_locked' : 'bad_confirm', ip)
    throw new ForbiddenException({ error: 'confirm required' })
  }
}
