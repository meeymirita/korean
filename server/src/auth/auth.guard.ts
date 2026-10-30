import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Events } from '../events/events.service'
import { RateLimiter, clientIp } from '../security'
import { OWNER, PUBLIC } from './auth'
import { AuthService } from './auth.service'

/** Проверяет токен на каждом запросе (кроме помеченных @Public) и кладёт в запрос `who`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly events: Events,
    private readonly limiter: RateLimiter,
  ) {}

  canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest()
    const who = this.auth.whoIs(req.headers.authorization)
    const ip = clientIp(req)
    if (who === 'expired') throw new UnauthorizedException({ error: 'expired' })
    if (!who) {
      if (req.headers.authorization) {
        // неверный токен: пишем в журнал и считаем попытку; после нескольких подряд адрес блокируется
        const locked = this.limiter.fail(ip)
        this.events.log(locked ? 'ip_locked' : 'bad_token', ip)
      }
      throw new UnauthorizedException({ error: 'unauthorized' })
    }
    this.limiter.ok(ip)
    if (who.role !== 'owner' && this.reflector.getAllAndOverride<boolean>(OWNER, targets)) throw new ForbiddenException({ error: 'forbidden' })
    req.who = who
    return true
  }
}
