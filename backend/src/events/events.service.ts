/** Журнал событий (таблица events): входы, гостевые токены, неверные токены. Хранятся последние MAX_EVENTS. */
import { Injectable, Optional } from '@nestjs/common'
import { MAX_EVENTS } from '../config.js'
import { Db } from '../db/db.service.js'
import { NotifyService } from '../notify/notify.service.js'

/** События защиты, о которых сразу пишем в Telegram: тип → заголовок и тема. `info` у «плохих» событий это адрес. */
const SECURITY: Record<string, { title: string; topic: 'alert' | 'login'; ip?: boolean; every?: number }> = {
  bad_token: { title: 'Неверный токен', topic: 'alert', ip: true },
  bad_confirm: { title: 'Неверный токен в подтверждении', topic: 'alert', ip: true },
  '2fa_bad_code': { title: 'Неверный код второго шага', topic: 'alert', ip: true },
  code_bad: { title: 'Неверный код входа', topic: 'alert', ip: true },
  ip_locked: { title: 'Адрес заблокирован после неверных попыток', topic: 'alert', ip: true, every: 3_600_000 },
  '2fa_login': { title: 'Вход выполнен (токен и код)', topic: 'login' },
  code_login: { title: 'Вход выполнен по коду', topic: 'login' },
}
/** Не чаще одного оповещения об одном и том же в 10 минут (перебор не должен засыпать группу). */
const THROTTLE = 600_000

@Injectable()
export class Events {
  private readonly lastAlert = new Map<string, number>()

  constructor(
    private readonly db: Db,
    @Optional() private readonly notify?: NotifyService,
  ) {}

  /** Оповещение в Telegram о событии защиты; никогда не бросает и не задерживает запись события. */
  private alert(type: string, info: string) {
    const rule = SECURITY[type]
    if (!rule || !this.notify || process.env.SECURITY_ALERTS === '0') return
    const key = `${type}:${info}`
    const now = Date.now()
    if (now - (this.lastAlert.get(key) ?? 0) < (rule.every ?? THROTTLE)) return
    this.lastAlert.set(key, now)
    if (this.lastAlert.size > 500) this.lastAlert.clear()
    const lead = rule.ip && info ? `Адрес: ${info}.` : ''
    void this.notify.sendSecurity(rule.topic, rule.title, lead || 'Время и подробности: Кабинет → Сервисы.')
  }

  /** `info` пишется в журнал целиком; `alertInfo` (обычно адрес) идёт в Telegram и в ключ «не чаще раза в 10 минут». */
  async log(type: string, info = '', alertInfo = info) {
    // подозрительные события (неверный токен и код, блокировка) пишем как предупреждение
    console[/bad|locked|failed|denied|expired/.test(type) ? 'warn' : 'log'](`событие ${type}${info ? ': ' + info : ''}`) // видно в «Сервисы → Журнал»
    this.alert(type, alertInfo)
    const events = await this.db.orm()
    await events.event.create({ data: { t: BigInt(Date.now()), type, info: info.slice(0, 200) } })
    const latest = await events.event.aggregate({ _max: { id: true } })
    if (latest._max.id !== null) await events.event.deleteMany({ where: { id: { lte: latest._max.id - BigInt(MAX_EVENTS) } } })
  }
}
