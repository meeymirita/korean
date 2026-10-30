/**
 * Двухфакторная защита: после токена владельца сервер просит ещё и код из 4 цифр, присланный на почту, заданную в кабинете.
 * За верный код выдаётся сеанс (случайная строка, в базе только её хэш, живёт 30 дней); сайт шлёт его вместе с токеном: «токен сеанс».
 * Пока защита выключена, ничего не меняется. Аварийный выход, если почта сломалась: DISABLE_2FA=1 в server/.env и перезапуск службы.
 */
import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { Db } from '../db/db.service'
import { Events } from '../events/events.service'
import { MailService } from '../mail/mail.service'
import { codeMail } from '../mail/templates'

const SESSION_DAYS = 30
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
    private readonly events: Events,
  ) {}

  private read(): Settings {
    try {
      const v = JSON.parse(this.db.getMeta('twofa') ?? '{}') as Partial<Settings>
      return { enabled: v.enabled === true && typeof v.email === 'string' && !!v.email, email: typeof v.email === 'string' ? v.email : '' }
    } catch {
      return { enabled: false, email: '' }
    }
  }

  /** Почта владельца для кода входа (пусто, если защита не настраивалась): сюда же по умолчанию уходят копии. */
  email() {
    return this.read().email
  }

  /** Требуется ли второй шаг прямо сейчас (с учётом аварийного выключателя). */
  required() {
    return this.read().enabled && process.env.DISABLE_2FA !== '1'
  }

  status() {
    const s = this.read()
    return { enabled: s.enabled, bypassed: s.enabled && process.env.DISABLE_2FA === '1', email: s.email ? maskEmail(s.email) : '', mailConfigured: this.mail.configured() }
  }

  /* ---------- сеансы ---------- */
  validSession(id: string): boolean {
    if (!/^[a-f0-9]{32}$/.test(id)) return false
    const row = this.db.get<{ expires: number }>('SELECT expires FROM sessions WHERE hash = ?', sha(id))
    return !!row && row.expires > Date.now()
  }

  private createSession(): string {
    const id = randomBytes(16).toString('hex')
    const now = Date.now()
    this.db.run('DELETE FROM sessions WHERE expires < ?', now)
    this.db.run('INSERT INTO sessions (hash, created, expires) VALUES (?, ?, ?)', sha(id), now, now + SESSION_DAYS * 86_400_000)
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
      await this.mail.send(email, mail.subject, mail.text, mail.html)
    } catch (e) {
      console.error(`Письмо с кодом не отправилось (${kind}): ${(e as Error).message}`) // видно во вкладке «Журналы»: чаще всего неверный пароль приложения или не включён SMTP
      this.events.log('2fa_mail_failed', kind)
      throw new ServiceUnavailableException({ error: 'mail failed' })
    }
    this.pending.set(kind, { hash: sha(code), email, expires: Date.now() + CODE_TTL, sent: Date.now(), tries: 0 })
    this.events.log('2fa_sent', kind)
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
    if (!this.required()) throw new BadRequestException({ error: '2fa off' })
    await this.issue('login', this.read().email)
    return { ok: true, email: maskEmail(this.read().email) }
  }

  /** Верный код входа: выдаёт сеанс. Неверный возвращает null (вызывающий считает попытку подбора). */
  verifyLogin(code: unknown): { session: string } | null {
    if (!this.check('login', code)) return null
    this.events.log('2fa_login', '')
    return { session: this.createSession() }
  }

  async startEnable(email: unknown) {
    if (typeof email !== 'string' || !EMAIL.test(email.trim())) throw new BadRequestException({ error: 'invalid email' })
    if (!this.mail.configured()) throw new ServiceUnavailableException({ error: 'mail not configured' })
    await this.issue('enable', email.trim())
    return { ok: true, email: maskEmail(email.trim()) }
  }

  /** Подтверждение адреса: защита включается только после того, как код дошёл. Текущее устройство остаётся в системе (получает сеанс). */
  confirmEnable(code: unknown): { session: string } | null {
    const p = this.check('enable', code)
    if (!p) return null
    this.db.setMeta('twofa', JSON.stringify({ enabled: true, email: p.email }))
    this.events.log('2fa_on', maskEmail(p.email))
    return { session: this.createSession() }
  }

  disable() {
    this.db.setMeta('twofa', JSON.stringify({ enabled: false, email: this.read().email }))
    this.db.run('DELETE FROM sessions')
    this.pending.clear()
    this.events.log('2fa_off', '')
    return { ok: true }
  }

  /** Выход со всех устройств: все сеансы сгорают, на каждом нужен новый код. */
  revokeSessions() {
    this.db.run('DELETE FROM sessions')
    this.events.log('2fa_sessions_revoked', '')
    return { ok: true }
  }
}
