/**
 * Напоминание заниматься: в выбранное время, если за день ещё нет ни одного ответа, на почту приходит письмо.
 * Настройки (включено, время ЧЧ:ММ по времени сервера, день последнего письма) лежат в `meta.reminder`; письмо одно в день.
 * Адрес: REMINDER_MAIL_TO в server/.env, иначе почта из двухфакторной защиты. Раз в минуту (REMINDER_TICK_MS для тестов) сервис проверяет, не пора ли.
 */
import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { TwoFaService, maskEmail } from '../auth/twofa.service'
import { Db } from '../db/db.service'
import { MailService } from '../mail/mail.service'
import { reminderMail } from '../mail/templates'

export interface ReminderSettings {
  enabled: boolean
  /** ЧЧ:ММ */
  time: string
  /** день (ГГГГ-ММ-ДД), когда письмо уже отправлено */
  lastSent: string
}

const DEFAULT: ReminderSettings = { enabled: false, time: '19:00', lastSent: '' }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type Tick = 'off' | 'early' | 'studied' | 'sent' | 'already' | 'nomail' | 'failed'

@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly mail: MailService,
    private readonly twofa: TwoFaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), Number(process.env.REMINDER_TICK_MS) || 60_000)
    this.timer.unref()
  }
  onModuleDestroy() {
    clearInterval(this.timer)
  }

  get(): ReminderSettings {
    try {
      const v = JSON.parse(this.db.getMeta('reminder') ?? '{}') as Partial<ReminderSettings>
      return {
        enabled: v.enabled === true,
        time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.time,
        lastSent: typeof v.lastSent === 'string' ? v.lastSent : '',
      }
    } catch {
      return { ...DEFAULT }
    }
  }

  private save(s: ReminderSettings) {
    this.db.setMeta('reminder', JSON.stringify(s))
  }

  set(body: { enabled?: unknown; time?: unknown }) {
    const cur = this.get()
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid enabled' })
      cur.enabled = body.enabled
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

  /** Ответов сегодня (всего). */
  private answersToday(day: string) {
    return this.db.get<{ total: number }>('SELECT total FROM days WHERE day = ?', day)?.total ?? 0
  }

  /** Серия дней с верными ответами, оканчивающаяся вчера: именно её письмо просит не прерывать. */
  private streakBefore(day: string) {
    const d = new Date(day + 'T12:00:00')
    let n = 0
    for (;;) {
      d.setDate(d.getDate() - 1)
      const ok = this.db.get<{ ok: number }>('SELECT ok FROM days WHERE day = ?', dayOf(d))?.ok ?? 0
      if (ok <= 0) return n
      n++
    }
  }

  private async deliver(day: string) {
    const m = reminderMail({ streak: this.streakBefore(day), site: process.env.SITE_URL })
    await this.mail.send(this.to(), m.subject, m.text, m.html)
  }

  /** Одна проверка (раз в минуту). Возвращает, что сделано: для тестов. */
  async tick(now = new Date()): Promise<Tick> {
    const s = this.get()
    if (!s.enabled) return 'off'
    const day = dayOf(now)
    if (`${pad(now.getHours())}:${pad(now.getMinutes())}` < s.time) return 'early'
    if (s.lastSent === day) return 'already'
    if (this.answersToday(day) > 0) return 'studied'
    if (!this.mail.configured() || !this.to()) return 'nomail'
    // метка ставится до отправки: если почта медленная, следующая проверка не пошлёт второе письмо
    this.save({ ...s, lastSent: day })
    try {
      await this.deliver(day)
      return 'sent'
    } catch (e) {
      console.error('письмо-напоминание не отправилось:', (e as Error).message)
      this.save({ ...s, lastSent: '' })
      return 'failed'
    }
  }

  /** Проверочное письмо по кнопке: не зависит ни от времени, ни от того, занимался ли сегодня. */
  async test() {
    if (!this.mail.configured() || !this.to()) return { ok: false, message: 'некуда отправлять: настройте почту (SMTP_*) и адрес' }
    try {
      await this.deliver(dayOf(new Date()))
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: 'Почта: ' + (e as Error).message.slice(0, 120) }
    }
  }
}
