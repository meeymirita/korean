import { Controller, HttpCode, Post } from '@nestjs/common'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'
import { CurrentWho, Who } from './auth'

/** POST /api/session: сайт вызывает его один раз при входе по токену, чтобы вход попал в журнал событий. */
@Controller('session')
export class SessionController {
  constructor(
    private readonly db: Db,
    private readonly events: Events,
  ) {}

  @Post()
  @HttpCode(200)
  login(@CurrentWho() who: Who) {
    if (who.role === 'owner') this.events.log('login', 'владелец')
    else this.events.log('guest_login', this.db.get<{ label: string }>('SELECT label FROM guests WHERE id = ?', who.id)?.label || who.id)
    return { role: who.role }
  }
}
