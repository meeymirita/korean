/** Журнал событий (таблица events): входы, гостевые токены, неверные токены. Хранятся последние MAX_EVENTS. */
import { Injectable } from '@nestjs/common'
import { MAX_EVENTS } from '../config'
import { Db } from '../db/db.service'
import { push } from '../logs/log-buffer'

@Injectable()
export class Events {
  constructor(private readonly db: Db) {}

  log(type: string, info = '') {
    // то же событие видно во вкладке «Журналы»; подозрительные (неверный токен и код, блокировка) отмечены как предупреждение
    push(`событие ${type}${info ? ': ' + info : ''}`, 'out', /bad|locked|failed/.test(type) ? 'warn' : 'info')
    this.db.run('INSERT INTO events (t, type, info) VALUES (?, ?, ?)', Date.now(), type, info.slice(0, 200))
    this.db.run('DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?', MAX_EVENTS)
  }
}
