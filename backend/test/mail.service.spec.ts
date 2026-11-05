import { afterEach, describe, expect, it, vi } from 'vitest'

const doubles = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }))

vi.mock('nodemailer', () => ({
  createTransport: doubles.createTransport,
}))

import { MailService } from '../src/mail/mail.service'

describe('служба почты без SMTP и внешней сети', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    doubles.createTransport.mockReset()
    doubles.sendMail.mockReset()
    doubles.createTransport.mockImplementation(() => ({ sendMail: doubles.sendMail }))
  })

  it('считает почту доступной только при настроенном SMTP или тестовом приёмнике', () => {
    vi.stubEnv('MAIL_DUMP_FILE', '')
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_FROM', '')
    expect(new MailService().configured()).toBe(false)

    vi.stubEnv('MAIL_DUMP_FILE', '/tmp/mail.jsonl')
    expect(new MailService().configured()).toBe(true)
    vi.stubEnv('MAIL_DUMP_FILE', '')
    vi.stubEnv('SMTP_HOST', 'smtp.example.test')
    vi.stubEnv('SMTP_FROM', 'korean@example.test')
    expect(new MailService().configured()).toBe(true)
  })

  it('отправляет письмо и вложения через отдельный транспорт с долгим таймаутом', async () => {
    vi.stubEnv('MAIL_DUMP_FILE', '')
    vi.stubEnv('SMTP_HOST', 'smtp.example.test')
    vi.stubEnv('SMTP_PORT', '587')
    vi.stubEnv('SMTP_FROM', 'korean@example.test')
    vi.stubEnv('SMTP_USER', 'mailer')
    vi.stubEnv('SMTP_PASS', 'secret')
    doubles.createTransport.mockImplementation(() => ({ sendMail: doubles.sendMail }))
    const mail = new MailService()

    await mail.send('owner@example.test', 'Копия', 'Файл приложен', '<p>Файл приложен</p>', [{ filename: 'backup.dump', path: '/tmp/backup.dump' }])

    expect(doubles.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      auth: { user: 'mailer', pass: 'secret' },
      socketTimeout: 300_000,
    }))
    expect(doubles.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'korean@example.test',
      to: 'owner@example.test',
      subject: 'Копия',
      text: 'Файл приложен',
      html: '<p>Файл приложен</p>',
      attachments: [{ filename: 'backup.dump', path: '/tmp/backup.dump' }],
      headers: expect.objectContaining({ 'Auto-Submitted': 'auto-generated' }),
    }))
  })

  it('возвращает ошибку отправки вызывающему сценарию', async () => {
    vi.stubEnv('MAIL_DUMP_FILE', '')
    vi.stubEnv('SMTP_HOST', 'smtp.example.test')
    vi.stubEnv('SMTP_PORT', '465')
    vi.stubEnv('SMTP_FROM', 'korean@example.test')
    doubles.createTransport.mockImplementation(() => ({ sendMail: doubles.sendMail.mockRejectedValue(new Error('SMTP rejected')) }))

    await expect(new MailService().send('owner@example.test', 'Тест', 'текст')).rejects.toThrow('SMTP rejected')
    expect(doubles.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, socketTimeout: 15_000 }))
  })
})
