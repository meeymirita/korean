import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotifyService } from '../src/notify/notify.service'
import { codeMail, digestMail, reminderMail } from '../src/mail/templates'

const mail = (configured = false) => ({ configured: () => configured, send: vi.fn() })

describe('уведомления: Telegram с запасом на почту', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('без Telegram и почты слать некуда', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_CHAT_ID', '')
    vi.stubEnv('TELEGRAM_DUMP_FILE', '')
    const n = new NotifyService(mail() as never)
    expect(n.ready('a@b.c')).toBe(false)
    await expect(n.send(reminderMail(), 'a@b.c')).rejects.toThrow()
  })

  it('с Telegram сообщение уходит в чат с кнопкой, в стиле письма', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'tg-')), 'tg.jsonl')
    vi.stubEnv('TELEGRAM_DUMP_FILE', file)
    vi.stubEnv('TELEGRAM_CHAT_ID', '1')
    const m = mail(true)
    const n = new NotifyService(m as never)
    expect(n.label('a@b.c')).toBe('Telegram')
    await n.send(reminderMail({ streak: 3, site: 'https://x.test' }), 'a@b.c')
    const sent = JSON.parse(readFileSync(file, 'utf8').trim())
    expect(sent.parse_mode).toBe('HTML')
    expect(sent.text).toContain('우리말')
    expect(sent.reply_markup.inline_keyboard[0][0].url).toBe('https://x.test/korean/quick')
    expect(m.send).not.toHaveBeenCalled()
  })

  it('код в Telegram можно скопировать нажатием, разметка экранирована', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'tg-')), 'tg.jsonl')
    vi.stubEnv('TELEGRAM_DUMP_FILE', file)
    await new NotifyService(mail() as never).send(codeMail('0427', 'login'))
    expect(readFileSync(file, 'utf8')).toContain('<code>0427</code>')
    await new NotifyService(mail() as never).send(digestMail({ words: [['a<b', 'x&y']], sentences: [], time: '09:00' }))
    expect(readFileSync(file, 'utf8')).toContain('a&lt;b')
  })

  it('без Telegram письмо уходит на почту', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_CHAT_ID', '')
    vi.stubEnv('TELEGRAM_DUMP_FILE', '')
    const m = mail(true)
    await new NotifyService(m as never).send(reminderMail(), 'a@b.c')
    expect(m.send).toHaveBeenCalledOnce()
  })
})
