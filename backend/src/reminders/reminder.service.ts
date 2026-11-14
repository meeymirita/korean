/**
 * Напоминание заниматься: в выбранное время, если за день ещё нет ни одного ответа, на почту приходит письмо.
 * Настройки (включено, время ЧЧ:ММ по времени сервера, день последнего письма) лежат в `meta.reminder`; письмо одно в день.
 * Адрес: REMINDER_MAIL_TO в backend/.env, иначе почта из двухфакторной защиты. Раз в минуту (REMINDER_TICK_MS для тестов) сервис проверяет, не пора ли.
 */
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { TwoFaService } from '../auth/twofa.service.js'
import { Db } from '../db/db.service.js'
import { NotifyService } from '../notify/notify.service.js'
import { reminderMail } from '../mail/templates.js'
import { BackgroundJobs } from '../jobs/background-jobs.service.js'
import { logError } from '../log.js'

export interface ReminderSettings {
  enabled: boolean
  /** ЧЧ:ММ */
  time: string
  /** день (ГГГГ-ММ-ДД), когда письмо уже отправлено */
  lastSent: string
  /** дни недели, когда письмо может прийти: 0 — воскресенье … 6 — суббота; пусто — каждый день */
  days: number[]
}

const DEFAULT: ReminderSettings = { enabled: false, time: '19:00', lastSent: '', days: [] }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const isDays = (v: unknown): v is number[] => Array.isArray(v) && v.every(d => Number.isInteger(d) && d >= 0 && d <= 6)

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type Tick = 'off' | 'early' | 'studied' | 'sent' | 'already' | 'nomail' | 'failed'

@Injectable()
export class ReminderService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
    private readonly twofa: TwoFaService,
    private readonly jobs: BackgroundJobs,
  ) {}

  onModuleInit() {
    this.jobs.register('reminder.tick', async () => {
      const result = await this.tick()
      if (result === 'failed') throw new Error('Не удалось отправить напоминание')
      return result
    })
  }

  async get(): Promise<ReminderSettings> {
    try {
      const v = JSON.parse(await this.db.getMeta('reminder') ?? '{}') as Partial<ReminderSettings>
      return {
        enabled: v.enabled === true,
        time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.time,
        lastSent: typeof v.lastSent === 'string' ? v.lastSent : '',
        days: isDays(v.days) ? [...new Set(v.days)].sort() : [],
      }
    } catch {
      return { ...DEFAULT }
    }
  }

  private async save(s: ReminderSettings) {
    await this.db.setMeta('reminder', JSON.stringify(s))
  }

  async set(body: { enabled?: unknown; time?: unknown; days?: unknown }) {
    const cur = await this.get()
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid enabled' })
      cur.enabled = body.enabled
    }
    if (body.time !== undefined) {
      if (typeof body.time !== 'string' || !TIME.test(body.time)) throw new BadRequestException({ error: 'invalid time' })
      if (body.time !== cur.time) cur.lastSent = '' // новое время: сегодня ещё можно напомнить
      cur.time = body.time
    }
    if (body.days !== undefined) {
      if (!isDays(body.days)) throw new BadRequestException({ error: 'invalid days' })
      cur.days = [...new Set(body.days)].sort()
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

  /** Ответов сегодня (всего). */
  private async answersToday(day: string) {
    return (await (await this.db.orm()).day.findUnique({ where: { day }, select: { total: true } }))?.total ?? 0
  }

  /** Сколько разных дней уже были ответы (до сегодняшнего): письмо называет число, ничем не грозя. */
  private async studyDaysBefore(day: string) {
    return (await this.db.orm()).day.count({ where: { total: { gt: 0 }, day: { lt: day } } })
  }

  private async deliver(day: string) {
    const m = reminderMail({ studyDays: await this.studyDaysBefore(day), site: process.env.SITE_URL })
    await this.notify.send(m, await this.to())
  }

  /** Идёт ли проверка: следующий тик не начинается, пока не закончилась предыдущая (иначе два тика подряд, оба до записи метки, шлют два письма). */
  private ticking = false

  /** Одна проверка (раз в минуту). Возвращает, что сделано: для тестов. */
  async tick(now = new Date()): Promise<Tick> {
    if (this.ticking) return 'already'
    this.ticking = true
    try {
      return await this.tickOnce(now)
    } finally {
      this.ticking = false
    }
  }

  private async tickOnce(now: Date): Promise<Tick> {
    const s = await this.get()
    if (!s.enabled) return 'off'
    if (s.days.length && !s.days.includes(now.getDay())) return 'off'
    const day = dayOf(now)
    if (`${pad(now.getHours())}:${pad(now.getMinutes())}` < s.time) return 'early'
    if (s.lastSent === day) return 'already'
    if (await this.answersToday(day) > 0) return 'studied'
    if (!this.notify.ready(await this.to())) return 'nomail'
    // метка ставится до отправки: если почта медленная, следующая проверка не пошлёт второе письмо
    await this.save({ ...s, lastSent: day })
    try {
      await this.deliver(day)
      return 'sent'
    } catch (e) {
      logError('письмо-напоминание не отправилось:', (e as Error).message)
      await this.save({ ...s, lastSent: '' })
      return 'failed'
    }
  }

  /** Проверочное письмо по кнопке: не зависит ни от времени, ни от того, занимался ли сегодня. */
  async test() {
    if (!this.notify.ready(await this.to())) return { ok: false, message: 'некуда отправлять: подключите Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) или почту' }
    try {
      await this.deliver(dayOf(new Date()))
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: 'Отправка: ' + (e as Error).message.slice(0, 120) }
    }
  }
}
