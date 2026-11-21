import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Events } from '../events/events.service.js'
import { RateLimiter, clientIp, describeClient } from '../security.js'
import { ALLOW_PENDING, INBOX_READ, INBOX_WRITE, OWNER, PUBLIC } from './auth.js'
import { AuthService } from './auth.service.js'
import { TwoFaService } from './twofa.service.js'

/** Проверяет токен на каждом запросе (кроме помеченных @Public) и кладёт в запрос `who`. */
@Injectable()
export class AuthGuard implements CanActivate {
  /** Успешные запросы с токеном «Входящих»: в таблицу событий не чаще раза в минуту на адрес и маршрут (в журнал сервиса пишутся все). */
  private readonly inboxSeen = new Map<string, number>()

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
    if (who === 'session') throw new UnauthorizedException({ error: 'session' })
    const scope = who ? null : await this.auth.inboxScope(req.headers.authorization)
    if (scope) {
      // временный токен входящих: чтение помеченных @InboxRead маршрутов; с записью (`write`) ещё POST помеченных @InboxWrite; всё остальное 403
      const read = req.method === 'GET' && this.reflector.getAllAndOverride<boolean>(INBOX_READ, targets)
      const write = scope === 'write' && req.method === 'POST' && this.reflector.getAllAndOverride<boolean>(INBOX_WRITE, targets)
      if (!read && !write) {
        await this.events.log('inbox_denied', describeClient(req), ip)
        throw new ForbiddenException({ error: 'forbidden' })
      }
      await this.logInbox(req, ip, scope)
      req.who = { role: 'owner' }
      return true
    }
    if (!who) {
      if (req.headers.authorization) {
        if (await this.auth.inboxExpired(req.headers.authorization)) {
          // просроченный токен «Входящих» (приложение пришло со старым токеном): это не подбор, адрес не блокируем и в Telegram не пишем
          await this.events.log('inbox_expired', describeClient(req), '')
          throw new UnauthorizedException({ error: 'unauthorized' })
        }
        // неверный токен: пишем в журнал (адрес, метод, путь, начало User-Agent) и считаем попытку; после нескольких подряд адрес блокируется
        const locked = this.limiter.fail(ip)
        await this.events.log(locked ? 'ip_locked' : 'bad_token', describeClient(req), ip)
      }
      throw new UnauthorizedException({ error: 'unauthorized' })
    }
    if (who.role === 'owner' && who.pending && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, targets)) throw new UnauthorizedException({ error: (await this.twofa.required()) ? '2fa' : 'session' })
    this.limiter.ok(ip)
    if (who.role !== 'owner' && this.reflector.getAllAndOverride<boolean>(OWNER, targets)) throw new ForbiddenException({ error: 'forbidden' })
    req.who = who
    return true
  }

  private async logInbox(req: { method: string; path: string }, ip: string, scope: 'read' | 'write') {
    const info = `${describeClient(req as never)} (${scope})`
    const key = `${ip} ${req.method} ${req.path}`
    const now = Date.now()
    if (now - (this.inboxSeen.get(key) ?? 0) < 60_000) return console.log(`событие inbox_ok: ${info}`)
    if (this.inboxSeen.size > 500) this.inboxSeen.clear()
    this.inboxSeen.set(key, now)
    await this.events.log('inbox_ok', info, '')
  }
}
