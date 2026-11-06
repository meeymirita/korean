import { Controller, HttpCode, Post } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import { AllowPending, CurrentWho, Who } from './auth.js'
import { TwoFaService } from './twofa.service.js'

/** POST /api/session: сайт вызывает его один раз при входе по токену, чтобы вход попал в журнал событий. */
@Controller('session')
export class SessionController {
  constructor(
    private readonly db: Db,
    private readonly events: Events,
    private readonly twofa: TwoFaService,
  ) {}

  /**
   * При OWNER_SESSION_HOURS и без двухфакторной защиты вход по токену выдаёт сеанс на эти часы (в ответе `session`); дальше сервер просит токен вместе с сеансом.
   * С двухфакторной защитой сеанс выдаётся только за верный код, здесь токен ещё «ожидает» код.
   */
  @AllowPending()
  @Post()
  @HttpCode(200)
  async login(@CurrentWho() who: Who) {
    if (who.role === 'owner' && who.pending) {
      if (await this.twofa.required()) return { role: 'owner', pending: true }
      await this.events.log('login', 'владелец')
      return { role: 'owner', session: await this.twofa.createSession() }
    }
    if (who.role === 'owner') await this.events.log('login', 'владелец')
    else {
      const guest = await (await this.db.orm()).guest.findUnique({ where: { id: who.id }, select: { label: true } })
      await this.events.log('guest_login', guest?.label || who.id)
    }
    return { role: who.role }
  }
}
