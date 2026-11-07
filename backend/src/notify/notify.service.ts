/**
 * Уведомления: Telegram (основной путь) с запасом на почту.
 * .env: TELEGRAM_BOT_TOKEN (из @BotFather), TELEGRAM_CHAT_ID (число; узнать: написать боту /start и открыть getUpdates).
 * Группа с темами: TELEGRAM_GROUP_ID (число -100…), TELEGRAM_TOPIC_LOGIN|REMIND|DIGEST|LESSON|BACKUP|ALERT (номера тем), каждое уведомление уходит
 * в свою тему с баннером (<TELEGRAM_BANNER_BASE>/tg/tg-<тема>.png, файлы лежат в frontend/public/tg). Код входа остаётся в личном чате, пока не TELEGRAM_LOGIN_TO_GROUP=1.
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
    return !!process.env.TELEGRAM_DUMP_FILE || !!(process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_GROUP_ID))
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

  /** Куда слать: тема группы (если группа и номер темы заданы) или личный чат. Код входа остаётся в личном чате, пока не включён TELEGRAM_LOGIN_TO_GROUP=1. */
  private route(m: Mail): { chat_id: string; message_thread_id?: number; banner?: string } | undefined {
    const env = process.env
    const thread = m.topic ? Number(env[`TELEGRAM_TOPIC_${m.topic.toUpperCase()}`]) : NaN
    const toGroup = !!env.TELEGRAM_GROUP_ID && Number.isInteger(thread) && thread > 0 && (m.topic !== 'login' || env.TELEGRAM_LOGIN_TO_GROUP === '1')
    if (toGroup) {
      const base = (env.TELEGRAM_BANNER_BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')
      return { chat_id: env.TELEGRAM_GROUP_ID!, message_thread_id: thread, banner: `${base}/tg/tg-${m.topic}.png` }
    }
    return env.TELEGRAM_CHAT_ID ? { chat_id: env.TELEGRAM_CHAT_ID } : undefined
  }

  private async tgCall(method: string, body: object) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (process.env.TELEGRAM_DUMP_FILE) {
      appendFileSync(process.env.TELEGRAM_DUMP_FILE, JSON.stringify(method === 'sendMessage' ? body : { method, ...body }) + '\n')
      return
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const r = (await res.json().catch(() => ({}))) as { description?: string }
      throw new Error(`Telegram ${res.status}: ${r.description ?? 'ошибка'}`.replace(token!, '***'))
    }
  }

  private async sendTelegram(m: Mail) {
    const to = this.route(m)
    if (!to) throw new Error('Telegram: не задан ни чат, ни группа с темой')
    const text = (m.tg?.html ?? plain(m.text)).slice(0, 4000)
    const markup = m.tg?.button ? { reply_markup: { inline_keyboard: [[{ text: m.tg.button.text, url: m.tg.button.url }]] } } : {}
    const { banner, ...target } = to
    if (banner) {
      try {
        if (text.length <= 1000) {
          await this.tgCall('sendPhoto', { ...target, photo: banner, caption: text, parse_mode: 'HTML', ...markup })
          return
        }
        await this.tgCall('sendPhoto', { ...target, photo: banner })
      } catch (e) {
        // баннера ещё нет или Telegram его не скачал: шлём обычное сообщение
        console.error('Telegram: баннер не ушёл, шлю текстом:', (e as Error).message)
      }
    }
    await this.tgCall('sendMessage', { ...target, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...markup })
  }
}

function maskTo(e: string) {
  const [name = '', domain = ''] = e.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`
}
