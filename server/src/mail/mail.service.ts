/**
 * Отправка писем через SMTP (nodemailer). Доступы лежат в server/.env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (адрес отправителя).
 * Для тестов: MAIL_DUMP_FILE=путь — письма не уходят, а дописываются строками JSON в этот файл.
 */
import { Injectable } from '@nestjs/common'
import { appendFileSync } from 'node:fs'
import { createTransport, type Transporter } from 'nodemailer'

@Injectable()
export class MailService {
  private transport?: Transporter

  /** Настроена ли отправка (без этого двухфакторную защиту включить нельзя: код некуда слать). */
  configured() {
    return !!process.env.MAIL_DUMP_FILE || !!(process.env.SMTP_HOST && process.env.SMTP_FROM)
  }

  async send(to: string, subject: string, text: string) {
    if (process.env.MAIL_DUMP_FILE) {
      appendFileSync(process.env.MAIL_DUMP_FILE, JSON.stringify({ to, subject, text }) + '\n')
      return
    }
    if (!this.configured()) throw new Error('mail not configured')
    this.transport ??= createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465, // 465 — сразу шифрованное соединение, 587 — STARTTLS
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    await this.transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text })
  }
}
