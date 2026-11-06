/**
 * Уведомления: Telegram (основной путь) с запасом на почту.
 * .env: TELEGRAM_BOT_TOKEN (из @BotFather), TELEGRAM_CHAT_ID (число; узнать: написать боту /start и открыть getUpdates).
 * Для тестов: TELEGRAM_DUMP_FILE=путь — сообщения не уходят, а дописываются строками JSON в файл.
 */
import { Injectable } from '@nestjs/common'
import { appendFileSync } from 'node:fs'
import { MailService } from '../mail/mail.service.js'
import type { Mail } from '../mail/templates.js'

const plain = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

@Injectable()
export class NotifyService {
  constructor(private readonly mail: MailService) {}

  /** Настроен ли Telegram. */
  telegram() {
    return !!process.env.TELEGRAM_DUMP_FILE || !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  }

  private validMail(to?: string) {
    return !!to && to.includes('@')
  }

  /** Есть ли куда слать: Telegram или (почта и адрес). */
  ready(mailTo?: string) {
    return this.telegram() || (this.mail.configured() && this.validMail(mailTo))
  }

  /** Куда придёт, для показа в кабинете. */
  label(mailTo?: string) {
    if (this.telegram()) return 'Telegram'
    return this.validMail(mailTo) ? maskTo(mailTo!) : ''
  }

  /** Отправляет в Telegram; не вышло или не настроен — письмом (если есть адрес). Ошибка, если не ушло никуда. */
  async send(m: Mail, mailTo?: string, files: { filename: string; path: string }[] = []) {
    let tgError: Error | undefined
    if (!files.length && this.telegram()) {
      try {
        await this.sendTelegram(m)
        return
      } catch (e) {
        tgError = e as Error
        console.error('Telegram не отправил:', tgError.message)
      }
    }
    if (this.mail.configured() && this.validMail(mailTo)) {
      await this.mail.send(mailTo!, m.subject, m.text, m.html, files)
      return
    }
    throw tgError ?? new Error('некуда отправлять: настройте Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) или почту')
  }

  private async sendTelegram(m: Mail) {
    const body = {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: (m.tg?.html ?? plain(m.text)).slice(0, 4000),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(m.tg?.button ? { reply_markup: { inline_keyboard: [[{ text: m.tg.button.text, url: m.tg.button.url }]] } } : {}),
    }
    if (process.env.TELEGRAM_DUMP_FILE) {
      appendFileSync(process.env.TELEGRAM_DUMP_FILE, JSON.stringify(body) + '\n')
      return
    }
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const r = (await res.json().catch(() => ({}))) as { description?: string }
      throw new Error(`Telegram ${res.status}: ${r.description ?? 'ошибка'}`.replace(process.env.TELEGRAM_BOT_TOKEN!, '***'))
    }
  }
}

function maskTo(e: string) {
  const [name = '', domain = ''] = e.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`
}
