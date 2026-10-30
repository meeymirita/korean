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
  private bulk?: Transporter

  /** Настроена ли отправка (без этого двухфакторную защиту включить нельзя: код некуда слать). */
  configured() {
    return !!process.env.MAIL_DUMP_FILE || !!(process.env.SMTP_HOST && process.env.SMTP_FROM)
  }

  private make(socketTimeout: number) {
    return createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465, // 465 — сразу шифрованное соединение, 587 — STARTTLS
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout,
    })
  }

  /** files — вложения (путь к файлу на диске); письма с ними идут по отдельному соединению с долгим ожиданием: файл в десятки мегабайт отправляется не за 15 секунд. */
  async send(to: string, subject: string, text: string, html?: string, files: { filename: string; path: string }[] = []) {
    if (process.env.MAIL_DUMP_FILE) {
      appendFileSync(process.env.MAIL_DUMP_FILE, JSON.stringify({ to, subject, text, html, files: files.map(f => f.filename) }) + '\n')
      return
    }
    if (!this.configured()) throw new Error('mail not configured')
    const transport = files.length ? (this.bulk ??= this.make(300_000)) : (this.transport ??= this.make(15_000))
    await transport.sendMail({
      attachments: files,
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
      // служебное письмо: почтовые программы не отвечают на него и не принимают за рассылку
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All', 'Precedence': 'bulk' },
    })
  }
}
