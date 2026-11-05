/** Журнал событий (таблица events): входы, гостевые токены, неверные токены. Хранятся последние MAX_EVENTS. */
import { Injectable } from '@nestjs/common'
import { MAX_EVENTS } from '../config.js'
import { Db } from '../db/db.service.js'

@Injectable()
export class Events {
  constructor(private readonly db: Db) {}

  async log(type: string, info = '') {
    // подозрительные события (неверный токен и код, блокировка) пишем как предупреждение
    console[/bad|locked|failed/.test(type) ? 'warn' : 'log'](`событие ${type}${info ? ': ' + info : ''}`) // видно в «Сервисы → Журнал»
    const events = await this.db.orm()
    await events.event.create({ data: { t: BigInt(Date.now()), type, info: info.slice(0, 200) } })
    const latest = await events.event.aggregate({ _max: { id: true } })
    if (latest._max.id !== null) await events.event.deleteMany({ where: { id: { lte: latest._max.id - BigInt(MAX_EVENTS) } } })
  }
}
