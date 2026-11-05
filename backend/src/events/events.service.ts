/** Журнал событий (таблица events): входы, гостевые токены, неверные токены. Хранятся последние MAX_EVENTS. */
import { Injectable } from '@nestjs/common'
import { MAX_EVENTS } from '../config.js'
import { Db } from '../db/db.service.js'
import { push } from '../logs/log-buffer.js'

@Injectable()
export class Events {
  constructor(private readonly db: Db) {}

  async log(type: string, info = '') {
    // то же событие видно во вкладке «Журналы»; подозрительные (неверный токен и код, блокировка) отмечены как предупреждение
    push(`событие ${type}${info ? ': ' + info : ''}`, 'out', /bad|locked|failed/.test(type) ? 'warn' : 'info')
    const events = await this.db.orm()
    await events.event.create({ data: { t: BigInt(Date.now()), type, info: info.slice(0, 200) } })
    const latest = await events.event.aggregate({ _max: { id: true } })
    if (latest._max.id !== null) await events.event.deleteMany({ where: { id: { lte: latest._max.id - BigInt(MAX_EVENTS) } } })
  }
}
