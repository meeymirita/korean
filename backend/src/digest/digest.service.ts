/**
 * Подборка по времени: в выбранное время на почту приходит письмо со случайными словами и предложениями на повторение.
 * В отличие от напоминания, приходит каждый день, занимался сегодня владелец или нет. Настройки (включено, время ЧЧ:ММ по
 * времени сервера, число слов и предложений, день последнего письма) лежат в `meta.digest`; письмо одно в день.
 * Адрес: REMINDER_MAIL_TO в backend/.env, иначе почта из двухфакторной защиты. Раз в минуту (REMINDER_TICK_MS для тестов) сервис проверяет, не пора ли.
 */
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { TwoFaService, maskEmail } from '../auth/twofa.service.js'
import { Db } from '../db/db.service.js'
import { MailService } from '../mail/mail.service.js'
import { digestMail } from '../mail/templates.js'
import { dayOf } from '../reminders/reminder.service.js'
import { DIGEST_SENTENCES, DIGEST_WORDS } from './pool.js'
import { BackgroundJobs } from '../jobs/background-jobs.service.js'

export interface DigestSettings {
  enabled: boolean
  /** ЧЧ:ММ */
  time: string
  words: number
  sentences: number
  /** день (ГГГГ-ММ-ДД), когда письмо уже отправлено */
  lastSent: string
}

export const MAX_WORDS = 30
export const MAX_SENTENCES = 15
const DEFAULT: DigestSettings = { enabled: false, time: '12:00', words: 10, sentences: 5, lastSent: '' }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export type DigestTick = 'off' | 'early' | 'sent' | 'already' | 'nomail' | 'failed'

/** n случайных разных элементов. */
export function sample<T>(a: readonly T[], n: number): T[] {
  const c = [...a]
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[c[i], c[j]] = [c[j]!, c[i]!]
  }
  return c.slice(0, Math.max(0, n))
}

const count = (v: unknown, max: number, def: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : def)

@Injectable()
export class DigestService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly mail: MailService,
    private readonly twofa: TwoFaService,
    private readonly jobs: BackgroundJobs,
  ) {}

  onModuleInit() {
    this.jobs.register('digest.tick', async () => {
      const result = await this.tick()
      if (result === 'failed') throw new Error('Не удалось отправить подборку')
      return result
    })
  }

  async get(): Promise<DigestSettings> {
    try {
      const v = JSON.parse(await this.db.getMeta('digest') ?? '{}') as Partial<DigestSettings>
      return {
        enabled: v.enabled === true,
        time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.time,
        words: count(v.words, MAX_WORDS, DEFAULT.words),
        sentences: count(v.sentences, MAX_SENTENCES, DEFAULT.sentences),
        lastSent: typeof v.lastSent === 'string' ? v.lastSent : '',
      }
    } catch {
      return { ...DEFAULT }
    }
  }

  private async save(s: DigestSettings) {
    await this.db.setMeta('digest', JSON.stringify(s))
  }

  async set(body: { enabled?: unknown; time?: unknown; words?: unknown; sentences?: unknown }, now = new Date()) {
    const cur = await this.get()
    const was = cur.enabled
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid enabled' })
      cur.enabled = body.enabled
    }
    if (body.time !== undefined) {
      if (typeof body.time !== 'string' || !TIME.test(body.time)) throw new BadRequestException({ error: 'invalid time' })
      cur.time = body.time
    }
    for (const [key, max] of [['words', MAX_WORDS], ['sentences', MAX_SENTENCES]] as const) {
      const v = body[key]
      if (v === undefined) continue
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw new BadRequestException({ error: `invalid ${key}` })
      cur[key] = v
    }
    if (cur.enabled && cur.words + cur.sentences === 0) throw new BadRequestException({ error: 'empty digest' })
    // включили или сдвинули время, когда сегодняшнее время уже прошло: первое письмо завтра, а не сразу (проверка есть кнопкой)
    if ((body.enabled === true && !was) || body.time !== undefined) cur.lastSent = hhmm(now) >= cur.time ? dayOf(now) : ''
    await this.save(cur)
    return await this.status()
  }

  async to() {
    return process.env.REMINDER_MAIL_TO || await this.twofa.email()
  }

  async status() {
    const [to, settings] = await Promise.all([this.to(), this.get()])
    return { ...settings, mailReady: this.mail.configured() && !!to, to: to ? maskEmail(to) : '', maxWords: MAX_WORDS, maxSentences: MAX_SENTENCES }
  }

  private async deliver(s: DigestSettings) {
    const m = digestMail({ words: sample(DIGEST_WORDS, s.words), sentences: sample(DIGEST_SENTENCES, s.sentences), time: s.time, site: process.env.SITE_URL })
    await this.mail.send(await this.to(), m.subject, m.text, m.html)
  }

  /** Одна проверка (раз в минуту). Возвращает, что сделано: для тестов. */
  async tick(now = new Date()): Promise<DigestTick> {
    const s = await this.get()
    if (!s.enabled) return 'off'
    const day = dayOf(now)
    if (hhmm(now) < s.time) return 'early'
    if (s.lastSent === day) return 'already'
    if (!this.mail.configured() || !await this.to()) return 'nomail'
    // метка ставится до отправки: если почта медленная, следующая проверка не пошлёт второе письмо
    await this.save({ ...s, lastSent: day })
    try {
      await this.deliver(s)
      return 'sent'
    } catch (e) {
      console.error('письмо-подборка не отправилось:', (e as Error).message)
      await this.save({ ...s, lastSent: '' })
      return 'failed'
    }
  }

  /** Проверочное письмо по кнопке: не зависит от времени и от того, включена ли подборка. */
  async test() {
    if (!this.mail.configured() || !await this.to()) return { ok: false, message: 'некуда отправлять: настройте почту (SMTP_*) и адрес' }
    const s = await this.get()
    if (s.words + s.sentences === 0) return { ok: false, message: 'В подборке нет ни слов, ни предложений' }
    try {
      await this.deliver(s)
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: 'Почта: ' + (e as Error).message.slice(0, 120) }
    }
  }
}
