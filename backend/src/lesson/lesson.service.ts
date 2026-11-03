/**
 * Напоминание о созвоне с учителем: в выбранный день недели и время приходит письмо «Сегодня созвон».
 * В отличие от напоминания заниматься (reminders/), не смотрит, был ли сегодня ответ: день созвона не про это.
 * Настройки (включено, день недели, время ЧЧ:ММ, день последнего письма) лежат в `meta.lesson`; письмо одно в день.
 * Адрес — тот же, что у напоминания заниматься: REMINDER_MAIL_TO в server/.env, иначе почта из двухфакторной защиты.
 */
import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { TwoFaService, maskEmail } from '../auth/twofa.service'
import { Db } from '../db/db.service'
import { MailService } from '../mail/mail.service'
import { lessonMail } from '../mail/templates'
import { dayOf } from '../reminders/reminder.service'

export interface LessonSettings {
  enabled: boolean
  /** 0 — воскресенье … 6 — суббота; по умолчанию суббота */
  weekday: number
  /** ЧЧ:ММ */
  time: string
  /** день (ГГГГ-ММ-ДД), когда письмо уже отправлено */
  lastSent: string
}

const DEFAULT: LessonSettings = { enabled: false, weekday: 6, time: '19:30', lastSent: '' }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export type Tick = 'off' | 'early' | 'already' | 'sent' | 'nomail' | 'failed'

@Injectable()
export class LessonService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly mail: MailService,
    private readonly twofa: TwoFaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), Number(process.env.LESSON_TICK_MS) || 60_000)
    this.timer.unref()
  }
  onModuleDestroy() {
    clearInterval(this.timer)
  }

  get(): LessonSettings {
    try {
      const v = JSON.parse(this.db.getMeta('lesson') ?? '{}') as Partial<LessonSettings>
      return {
        enabled: v.enabled === true,
        weekday: Number.isInteger(v.weekday) && v.weekday! >= 0 && v.weekday! <= 6 ? v.weekday! : DEFAULT.weekday,
        time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.time,
        lastSent: typeof v.lastSent === 'string' ? v.lastSent : '',
      }
    } catch {
      return { ...DEFAULT }
    }
  }

  private save(s: LessonSettings) {
    this.db.setMeta('lesson', JSON.stringify(s))
  }

  set(body: { enabled?: unknown; weekday?: unknown; time?: unknown }) {
    const cur = this.get()
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
    this.save(cur)
    return this.status()
  }

  to() {
    return process.env.REMINDER_MAIL_TO || this.twofa.email()
  }

  status() {
    const to = this.to()
    return { ...this.get(), mailReady: this.mail.configured() && !!to, to: to ? maskEmail(to) : '' }
  }

  private async deliver() {
    const m = lessonMail({ time: this.get().time, site: process.env.SITE_URL })
    await this.mail.send(this.to(), m.subject, m.text, m.html)
  }

  /** Одна проверка (раз в минуту). Возвращает, что сделано: для тестов. */
  async tick(now = new Date()): Promise<Tick> {
    const s = this.get()
    if (!s.enabled) return 'off'
    if (now.getDay() !== s.weekday) return 'off'
    const day = dayOf(now)
    const pad = (n: number) => String(n).padStart(2, '0')
    if (`${pad(now.getHours())}:${pad(now.getMinutes())}` < s.time) return 'early'
    if (s.lastSent === day) return 'already'
    if (!this.mail.configured() || !this.to()) return 'nomail'
    // метка ставится до отправки: если почта медленная, следующая проверка не пошлёт второе письмо
    this.save({ ...s, lastSent: day })
    try {
      await this.deliver()
      return 'sent'
    } catch (e) {
      console.error('письмо-напоминание о созвоне не отправилось:', (e as Error).message)
      this.save({ ...s, lastSent: '' })
      return 'failed'
    }
  }

  /** Проверочное письмо по кнопке: не зависит ни от дня, ни от времени. */
  async test() {
    if (!this.mail.configured() || !this.to()) return { ok: false, message: 'некуда отправлять: настройте почту (SMTP_*) и адрес' }
    try {
      await this.deliver()
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: 'Почта: ' + (e as Error).message.slice(0, 120) }
    }
  }
}
