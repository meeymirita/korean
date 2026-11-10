/**
 * Напоминание о созвоне с учителем: в выбранный день недели и время приходит письмо «Сегодня созвон».
 * В отличие от напоминания заниматься (reminders/), не смотрит, был ли сегодня ответ: день созвона не про это.
 * Настройки (включено, день недели, время сообщения `time`, время самого созвона `callTime`, день последнего письма) лежат в `meta.lesson`; письмо одно в день.
 * Адрес — тот же, что у напоминания заниматься: REMINDER_MAIL_TO в server/.env, иначе почта из двухфакторной защиты.
 */
import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { TwoFaService } from '../auth/twofa.service.js'
import { Db } from '../db/db.service.js'
import { NotifyService } from '../notify/notify.service.js'
import { lessonMail } from '../mail/templates.js'
import { dayOf } from '../reminders/reminder.service.js'
import { logError } from '../log.js'

export interface LessonSettings {
  enabled: boolean
  /** 0 — воскресенье … 6 — суббота; по умолчанию суббота */
  weekday: number
  /** во сколько приходит сообщение, ЧЧ:ММ */
  time: string
  /** во сколько сам созвон, ЧЧ:ММ: попадает в текст сообщения и в обратный отсчёт; нет в старых настройках, тогда равно `time` */
  callTime: string
  /** день (ГГГГ-ММ-ДД), когда письмо уже отправлено */
  lastSent: string
}

const DEFAULT: LessonSettings = { enabled: false, weekday: 6, time: '19:30', callTime: '19:30', lastSent: '' }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export type Tick = 'off' | 'early' | 'already' | 'sent' | 'nomail' | 'failed'

@Injectable()
export class LessonService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
    private readonly twofa: TwoFaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), Number(process.env.LESSON_TICK_MS) || 60_000)
    this.timer.unref()
  }
  onModuleDestroy() {
    clearInterval(this.timer)
  }

  async get(): Promise<LessonSettings> {
    try {
      const v = JSON.parse(await this.db.getMeta('lesson') ?? '{}') as Partial<LessonSettings>
      return {
        enabled: v.enabled === true,
        weekday: Number.isInteger(v.weekday) && v.weekday! >= 0 && v.weekday! <= 6 ? v.weekday! : DEFAULT.weekday,
        time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.time,
        callTime: typeof v.callTime === 'string' && TIME.test(v.callTime) ? v.callTime : typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.callTime,
        lastSent: typeof v.lastSent === 'string' ? v.lastSent : '',
      }
    } catch {
      return { ...DEFAULT }
    }
  }

  private async save(s: LessonSettings) {
    await this.db.setMeta('lesson', JSON.stringify(s))
  }

  async set(body: { enabled?: unknown; weekday?: unknown; time?: unknown; callTime?: unknown }) {
    const cur = await this.get()
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid enabled' })
      cur.enabled = body.enabled
    }
    if (body.weekday !== undefined) {
      if (!Number.isInteger(body.weekday) || (body.weekday as number) < 0 || (body.weekday as number) > 6) throw new BadRequestException({ error: 'invalid weekday' })
      cur.weekday = body.weekday as number
    }
    if (body.time !== undefined) {
      if (typeof body.time !== 'string' || !TIME.test(body.time)) throw new BadRequestException({ error: 'invalid time' })
      if (body.time !== cur.time) cur.lastSent = '' // новое время: сегодня ещё можно напомнить
      cur.time = body.time
    }
    if (body.callTime !== undefined) {
      if (typeof body.callTime !== 'string' || !TIME.test(body.callTime)) throw new BadRequestException({ error: 'invalid callTime' })
      cur.callTime = body.callTime
    }
    await this.save(cur)
    return await this.status()
  }

  async to() {
    return process.env.REMINDER_MAIL_TO || await this.twofa.email()
  }

  async status() {
    const [to, settings] = await Promise.all([this.to(), this.get()])
    return { ...settings, mailReady: this.notify.ready(to), to: this.notify.label(to) }
  }

  private async deliver() {
    // сообщение приходит в `time`, а в тексте стоит время самого созвона `callTime`
    const m = lessonMail({ time: (await this.get()).callTime, site: process.env.SITE_URL })
    await this.notify.send(m, await this.to())
  }

  /** Одна проверка (раз в минуту). Возвращает, что сделано: для тестов. */
  async tick(now = new Date()): Promise<Tick> {
    const s = await this.get()
    if (!s.enabled) return 'off'
    if (now.getDay() !== s.weekday) return 'off'
    const day = dayOf(now)
    const pad = (n: number) => String(n).padStart(2, '0')
    if (`${pad(now.getHours())}:${pad(now.getMinutes())}` < s.time) return 'early'
    if (s.lastSent === day) return 'already'
    if (!this.notify.ready(await this.to())) return 'nomail'
    // метка ставится до отправки: если почта медленная, следующая проверка не пошлёт второе письмо
    await this.save({ ...s, lastSent: day })
    try {
      await this.deliver()
      return 'sent'
    } catch (e) {
      logError('письмо-напоминание о созвоне не отправилось:', (e as Error).message)
      await this.save({ ...s, lastSent: '' })
      return 'failed'
    }
  }

  /** Проверочное письмо по кнопке: не зависит ни от дня, ни от времени. */
  async test() {
    if (!this.notify.ready(await this.to())) return { ok: false, message: 'некуда отправлять: подключите Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) или почту' }
    try {
      await this.deliver()
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: 'Отправка: ' + (e as Error).message.slice(0, 120) }
    }
  }
}
