import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Events } from '../events/events.service'
import { OWNER, PUBLIC } from './auth'
import { AuthService } from './auth.service'

/** Проверяет токен на каждом запросе (кроме помеченных @Public) и кладёт в запрос `who`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly events: Events,
  ) {}

  canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest()
    const who = this.auth.whoIs(req.headers.authorization)
    if (who === 'expired') throw new UnauthorizedException({ error: 'expired' })
    if (!who) {
      if (req.headers.authorization) this.events.log('bad_token', String(req.headers['x-forwarded-for'] || req.ip || ''))
      throw new UnauthorizedException({ error: 'unauthorized' })
    }
    if (who.role !== 'owner' && this.reflector.getAllAndOverride<boolean>(OWNER, targets)) throw new ForbiddenException({ error: 'forbidden' })
    req.who = who
    return true
  }
}
