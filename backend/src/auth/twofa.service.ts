/**
 * Двухфакторная защита: после токена владельца сервер просит ещё и код из 4 цифр, присланный на почту, заданную в кабинете.
 * За верный код выдаётся сеанс (случайная строка, в базе только её хэш, живёт 30 дней); сайт шлёт его вместе с токеном: «токен сеанс».
 * Пока защита выключена, ничего не меняется. Аварийный выход, если почта сломалась: DISABLE_2FA=1 в backend/.env и перезапуск службы.
 */
import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Db } from '../db/db.service.js'
import { Events } from '../events/events.service.js'
import { MailService } from '../mail/mail.service.js'
import { NotifyService } from '../notify/notify.service.js'
import { codeMail } from '../mail/templates.js'
import { logError } from '../log.js'

const SESSION_DAYS = 30
/** OWNER_SESSION_HOURS=4: вход по токену живёт 4 часа, потом токен нужно вводить заново (0 или пусто: сеанс только после кода, 30 дней). */
export const ownerSessionHours = () => Math.max(0, Math.min(Number(process.env.OWNER_SESSION_HOURS) || 0, 24 * 30))
const sessionMs = () => (ownerSessionHours() > 0 ? ownerSessionHours() * 3_600_000 : SESSION_DAYS * 86_400_000)
const CODE_TTL = 10 * 60_000
const RESEND_AFTER = 30_000
const MAX_TRIES = 5
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

interface Settings {
  enabled: boolean
  email: string
}
interface Pending {
  hash: string
  email: string
  expires: number
  sent: number
  tries: number
}

/** Вместо адреса почты: коды приходят в Telegram. */
const TG = 'telegram'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Адрес для показа: первая буква и домен, остальное звёздочки. */
export const maskEmail = (e: string) => {
  const [name = '', domain = ''] = e.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`
}

@Injectable()
export class TwoFaService {
  private readonly pending = new Map<'login' | 'enable', Pending>()

  constructor(
    private readonly db: Db,
    private readonly mail: MailService,
    private readonly notify: NotifyService,
    private readonly events: Events,
  ) {}

  private async read(): Promise<Settings> {
    try {
      const v = JSON.parse(await this.db.getMeta('twofa') ?? '{}') as Partial<Settings>
      return { enabled: v.enabled === true && typeof v.email === 'string' && !!v.email, email: typeof v.email === 'string' ? v.email : '' }
    } catch {
      return { enabled: false, email: '' }
    }
  }

  /** Почта владельца для кода входа (пусто, если защита не настраивалась): сюда же по умолчанию уходят копии. */
  async email() {
    return (await this.read()).email
  }

  /** Требуется ли второй шаг прямо сейчас (с учётом аварийного выключателя). */
  async required() {
    return (await this.read()).enabled && process.env.DISABLE_2FA !== '1'
  }

  async status() {
    const s = await this.read()
    return { enabled: s.enabled, bypassed: s.enabled && process.env.DISABLE_2FA === '1', email: this.notify.telegram() && s.email ? 'Telegram' : s.email === TG ? 'Telegram' : s.email ? maskEmail(s.email) : '', mailConfigured: this.notify.ready('x@x') || this.mail.configured(), telegram: this.notify.telegram() }
  }

  /* ---------- сеансы ---------- */
  async validSession(id: string): Promise<boolean> {
    if (!/^[a-f0-9]{32}$/.test(id)) return false
    const row = await (await this.db.orm()).session.findUnique({ where: { hash: sha(id) }, select: { expires: true } })
    return !!row && Number(row.expires) > Date.now()
  }

  async createSession(): Promise<string> {
    const id = randomBytes(16).toString('hex')
    const now = Date.now()
    const sessions = (await this.db.orm()).session
    await sessions.deleteMany({ where: { expires: { lt: BigInt(now) } } })
    await sessions.create({ data: { hash: sha(id), created: BigInt(now), expires: BigInt(now + sessionMs()) } })
    return id
  }

  /* ---------- коды ---------- */
  /** Создаёт код и шлёт письмо. Слишком частые запросы отклоняются (429). */
  private async issue(kind: 'login' | 'enable', email: string) {
    const old = this.pending.get(kind)
    if (old && Date.now() - old.sent < RESEND_AFTER) throw new HttpException({ error: 'too soon', wait: Math.ceil((RESEND_AFTER - (Date.now() - old.sent)) / 1000) }, 429)
    const code = String(randomInt(0, 10_000)).padStart(4, '0')
    try {
      const mail = codeMail(code, kind, CODE_TTL / 60_000)
      await this.notify.send(mail, email === TG ? undefined : email)
    } catch (e) {
      logError(`Письмо с кодом не отправилось (${kind}): ${(e as Error).message}`) // видно во вкладке «Журналы»: чаще всего неверный пароль приложения или не включён SMTP
      await this.events.log('2fa_mail_failed', kind)
      throw new ServiceUnavailableException({ error: 'mail failed' })
    }
    this.pending.set(kind, { hash: sha(code), email, expires: Date.now() + CODE_TTL, sent: Date.now(), tries: 0 })
    await this.events.log('2fa_sent', kind)
  }

  /** Проверяет код; верный сгорает. false — неверный; исчерпанные попытки и срок сжигают код. */
  private check(kind: 'login' | 'enable', code: unknown): Pending | false {
    const p = this.pending.get(kind)
    if (!p || p.expires < Date.now() || typeof code !== 'string' || !/^\d{4}$/.test(code)) return false
    if (++p.tries > MAX_TRIES) {
      this.pending.delete(kind)
      return false
    }
    if (!same(sha(code), p.hash)) return false
    this.pending.delete(kind)
    return p
  }

  async sendLogin() {
    if (!await this.required()) throw new BadRequestException({ error: '2fa off' })
    const email = (await this.read()).email
    await this.issue('login', email)
    return { ok: true, email: this.notify.telegram() || email === TG ? 'Telegram' : maskEmail(email) }
  }

  /** Верный код входа: выдаёт сеанс. Неверный возвращает null (вызывающий считает попытку подбора). */
  async verifyLogin(code: unknown): Promise<{ session: string } | null> {
    if (!this.check('login', code)) return null
    await this.events.log('2fa_login', '')
    return { session: await this.createSession() }
  }

  async startEnable(email: unknown) {
    const tg = this.notify.telegram()
    const given = typeof email === 'string' ? email.trim() : ''
    // с подключённым Telegram адрес почты не нужен: коды придут туда
    if (!(tg && !given) && !EMAIL.test(given)) throw new BadRequestException({ error: 'invalid email' })
    if (!tg && !this.mail.configured()) throw new ServiceUnavailableException({ error: 'mail not configured' })
    const to = tg ? TG : given
    await this.issue('enable', to)
    return { ok: true, email: tg ? 'Telegram' : maskEmail(to) }
  }

  /** Подтверждение адреса: защита включается только после того, как код дошёл. Текущее устройство остаётся в системе (получает сеанс). */
  async confirmEnable(code: unknown): Promise<{ session: string } | null> {
    const p = this.check('enable', code)
    if (!p) return null
    await this.db.setMeta('twofa', JSON.stringify({ enabled: true, email: p.email }))
    await this.events.log('2fa_on', p.email === TG ? 'Telegram' : maskEmail(p.email))
    return { session: await this.createSession() }
  }

  async disable() {
    await this.db.setMeta('twofa', JSON.stringify({ enabled: false, email: (await this.read()).email }))
    await (await this.db.orm()).session.deleteMany()
    this.pending.clear()
    await this.events.log('2fa_off', '')
    return { ok: true }
  }

  /** Выход со всех устройств: все сеансы сгорают, на каждом нужен новый код. */
  async revokeSessions() {
    await (await this.db.orm()).session.deleteMany()
    await this.events.log('2fa_sessions_revoked', '')
    return { ok: true }
  }
}
