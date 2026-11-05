import { Controller, HttpCode, Post } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import { CurrentWho, Who } from './auth.js'

/** POST /api/session: сайт вызывает его один раз при входе по токену, чтобы вход попал в журнал событий. */
@Controller('session')
export class SessionController {
  constructor(
    private readonly db: Db,
    private readonly events: Events,
  ) {}

  @Post()
  @HttpCode(200)
  async login(@CurrentWho() who: Who) {
    if (who.role === 'owner') await this.events.log('login', 'владелец')
    else {
      const guest = await (await this.db.orm()).guest.findUnique({ where: { id: who.id }, select: { label: true } })
      await this.events.log('guest_login', guest?.label || who.id)
    }
    return { role: who.role }
  }
}
