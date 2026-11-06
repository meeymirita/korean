import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Events } from '../events/events.service.js'
import { RateLimiter, clientIp } from '../security.js'
import { ALLOW_PENDING, OWNER, PUBLIC } from './auth.js'
import { AuthService } from './auth.service.js'
import { TwoFaService } from './twofa.service.js'

/** Проверяет токен на каждом запросе (кроме помеченных @Public) и кладёт в запрос `who`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly events: Events,
    private readonly limiter: RateLimiter,
    private readonly twofa: TwoFaService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest()
    const who = await this.auth.whoIs(req.headers.authorization)
    const ip = clientIp(req)
    if (who === 'expired') throw new UnauthorizedException({ error: 'expired' })
    if (!who) {
      if (req.headers.authorization) {
        // неверный токен: пишем в журнал и считаем попытку; после нескольких подряд адрес блокируется
        const locked = this.limiter.fail(ip)
        await this.events.log(locked ? 'ip_locked' : 'bad_token', ip)
      }
      throw new UnauthorizedException({ error: 'unauthorized' })
    }
    if (who.role === 'owner' && who.pending && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, targets)) throw new UnauthorizedException({ error: (await this.twofa.required()) ? '2fa' : 'session' })
    this.limiter.ok(ip)
    if (who.role !== 'owner' && this.reflector.getAllAndOverride<boolean>(OWNER, targets)) throw new ForbiddenException({ error: 'forbidden' })
    req.who = who
    return true
  }
}
