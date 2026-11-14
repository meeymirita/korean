import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { Events } from '../events/events.service.js'
import { RateLimiter, clientIp } from '../security.js'
import { Public } from './auth.js'
import { TwoFaService } from './twofa.service.js'

/**
 * /api/login/code: вход по коду без токена (Telegram или почта владельца). Открыт всем, потому что человек ещё не вошёл.
 * Защита: код из 6 цифр, пять попыток на код, пауза 30 секунд и не больше 6 кодов в час на весь сайт, неверный код считается подбором
 * (после нескольких подряд адрес блокируется). `CODE_LOGIN=0` в backend/.env выключает способ совсем.
 */
@Public()
@Controller('login/code')
export class CodeLoginController {
  constructor(
    private readonly twofa: TwoFaService,
    private readonly limiter: RateLimiter,
    private readonly events: Events,
  ) {}

  /** Какие способы есть (для экрана входа). */
  @Get('channels')
  channels() {
    return this.twofa.codeChannels()
  }

  /** `{ channel: 'telegram' | 'mail' }`: прислать код в этот канал. */
  @Post('send')
  @HttpCode(200)
  send(@Body() body: { channel?: unknown }) {
    return this.twofa.sendCode(body?.channel)
  }

  /** `{ code }`: верный код выдаёт сеанс (`session`), с ним сайт ходит как `ses:<сеанс>`. */
  @Post('verify')
  @HttpCode(200)
  async verify(@Req() req: Request, @Body() body: { code?: unknown }) {
    const done = await this.twofa.verifyCode(body?.code)
    if (done) return done
    const ip = clientIp(req)
    const locked = this.limiter.fail(ip, 'confirm')
    await this.events.log(locked ? 'ip_locked' : 'code_bad', ip)
    throw new UnauthorizedException({ error: 'wrong code' })
  }
}
