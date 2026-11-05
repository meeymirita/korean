import { Body, Controller, Delete, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { Events } from '../events/events.service.js'
import { RateLimiter, clientIp } from '../security.js'
import { AllowPending, Owner } from './auth.js'
import { ConfirmService } from './confirm.service.js'
import { TwoFaService } from './twofa.service.js'

/**
 * /api/2fa: двухфакторная защита (код из 4 цифр на почту). Шаги входа (`status`, `send`, `verify`) доступны владельцу, который ещё не ввёл код;
 * включение и выключение только после входа, выключение просит токен ещё раз. Неверный код считается попыткой подбора.
 */
@Owner()
@Controller('2fa')
export class TwoFaController {
  constructor(
    private readonly twofa: TwoFaService,
    private readonly confirm: ConfirmService,
    private readonly limiter: RateLimiter,
    private readonly events: Events,
  ) {}

  private async wrong(req: Request): Promise<never> {
    const ip = clientIp(req)
    const locked = this.limiter.fail(ip, 'confirm')
    await this.events.log(locked ? 'ip_locked' : '2fa_bad_code', ip)
    throw new UnauthorizedException({ error: 'wrong code' })
  }

  @AllowPending()
  @Get('status')
  status() {
    return this.twofa.status()
  }

  /** Шаг входа: прислать код на почту. */
  @AllowPending()
  @Post('send')
  @HttpCode(200)
  send() {
    return this.twofa.sendLogin()
  }

  /** Шаг входа: проверить код и получить сеанс. */
  @AllowPending()
  @Post('verify')
  @HttpCode(200)
  async verify(@Req() req: Request, @Body() body: { code?: unknown }) {
    return (await this.twofa.verifyLogin(body?.code)) ?? this.wrong(req)
  }

  @Post('enable/start')
  @HttpCode(200)
  start(@Body() body: { email?: unknown }) {
    return this.twofa.startEnable(body?.email)
  }

  @Post('enable/confirm')
  @HttpCode(200)
  async confirmEnable(@Req() req: Request, @Body() body: { code?: unknown }) {
    return (await this.twofa.confirmEnable(body?.code)) ?? this.wrong(req)
  }

  @Delete()
  async disable(@Req() req: Request) {
    await this.confirm.require(req) // повторный токен: как у остальных опасных действий
    return this.twofa.disable()
  }

  @Delete('sessions')
  async revoke(@Req() req: Request) {
    await this.confirm.require(req)
    return this.twofa.revokeSessions()
  }
}
