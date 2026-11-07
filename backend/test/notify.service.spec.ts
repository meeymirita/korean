import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotifyService } from '../src/notify/notify.service'
import { TG_HEART, TG_TOPICS, backupMail, codeMail, digestMail, reminderMail, sampleMail } from '../src/mail/templates'

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
    vi.stubEnv('TELEGRAM_CHAT_ID', '1')
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

  describe('группа с темами', () => {
    const setup = () => {
      const file = path.join(mkdtempSync(path.join(tmpdir(), 'tg-')), 'tg.jsonl')
      vi.stubEnv('TELEGRAM_DUMP_FILE', file)
      vi.stubEnv('TELEGRAM_CHAT_ID', '1')
      vi.stubEnv('TELEGRAM_GROUP_ID', '-100500')
      vi.stubEnv('TELEGRAM_TOPIC_LOGIN', '3')
      vi.stubEnv('TELEGRAM_TOPIC_REMIND', '9')
      vi.stubEnv('TELEGRAM_TOPIC_BACKUP', '15')
      vi.stubEnv('TELEGRAM_TOPIC_ALERT', '17')
      const read = () => readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l))
      return { n: new NotifyService(mail() as never), read }
    }

    it('напоминание уходит в свою тему фото-баннером с подписью и кнопкой', async () => {
      const { n, read } = setup()
      await n.send(reminderMail({ site: 'https://x.test' }))
      const [sent] = read()
      expect(sent).toMatchObject({ method: 'sendPhoto', chat_id: '-100500', message_thread_id: 9, photo: 'https://korean.meeymirita.ru/tg/tg-remind.png' })
      expect(sent.caption).toContain('우리말')
      expect(sent.reply_markup.inline_keyboard[0][0].url).toBe('https://x.test/korean/quick')
    })

    it('с группой код входа идёт в тему «Вход», а в личный чат не уходит ничего', async () => {
      const { n, read } = setup()
      await n.send(codeMail('0427', 'login'))
      expect(read()).toHaveLength(1)
      expect(read()[0]).toMatchObject({ chat_id: '-100500', message_thread_id: 3 })
    })

    it('тревоги о копиях и обычные копии идут в разные темы', async () => {
      const { n, read } = setup()
      await n.send(backupMail({ kind: 'nightly-fail' }))
      await n.send(backupMail({ kind: 'test' }))
      expect(read().map(r => r.message_thread_id)).toEqual([17, 15])
    })

    it('без номера темы с группой Telegram пропускается: личный чат не используется, уходит письмо', async () => {
      const file = path.join(mkdtempSync(path.join(tmpdir(), 'tg-')), 'tg.jsonl')
      vi.stubEnv('TELEGRAM_DUMP_FILE', file)
      vi.stubEnv('TELEGRAM_CHAT_ID', '1')
      vi.stubEnv('TELEGRAM_GROUP_ID', '-100500')
      vi.stubEnv('TELEGRAM_TOPIC_DIGEST', '')
      const m = mail(true)
      await new NotifyService(m as never).send(digestMail({ words: [['a', 'b']], sentences: [], time: '09:00' }), 'a@b.c')
      expect(() => readFileSync(file, 'utf8')).toThrow()
      expect(m.send).toHaveBeenCalledOnce()
    })

    it('проба из кабинета идёт строго в тему', async () => {
      const { n, read } = setup()
      await n.sendToTopic('login', 'проверка <b>')
      const [sent] = read()
      expect(sent).toMatchObject({ method: 'sendPhoto', chat_id: '-100500', message_thread_id: 3 })
      expect(sent.caption).toContain('проверка &lt;b&gt;')
    })

    it('проба в ненастроенную тему даёт понятную ошибку, а не уходит в личный чат', async () => {
      const { n, read } = setup()
      await expect(n.sendToTopic('digest', 'x')).rejects.toThrow(/не настроена/)
      expect(() => read()).toThrow()
    })

    it('topics() показывает, какие темы подключены', () => {
      const { n } = setup()
      vi.stubEnv('TELEGRAM_BOT_TOKEN', 't')
      const t = n.topics()
      expect(t.group).toBe(true)
      expect(t.topics.find(x => x.id === 'remind')?.ready).toBe(true)
      expect(t.topics.find(x => x.id === 'digest')?.ready).toBe(false)
    })

    it('сообщение каждой темы оформлено сердечком своей темы', () => {
      for (const t of TG_TOPICS) {
        const m = sampleMail(t)
        expect(m.topic).toBe(t)
        expect(m.tg?.html).toContain(`${TG_HEART[t]} <b>우리말</b> ${TG_HEART[t]}`)
      }
      expect(new Set(TG_TOPICS.map(t => TG_HEART[t])).size).toBe(6)
    })

    it('«Пример сообщения» шлёт настоящий шаблон с выдуманными данными строго в тему', async () => {
      const { n, read } = setup()
      vi.stubEnv('TELEGRAM_TOPIC_DIGEST', '11')
      await n.sendSample('digest')
      await n.sendSample('login')
      const [digest, login] = read()
      expect(digest).toMatchObject({ chat_id: '-100500', message_thread_id: 11 })
      expect(JSON.stringify(digest)).toContain('안녕하세요')
      expect(login).toMatchObject({ message_thread_id: 3 })
      expect(JSON.stringify(login)).toContain('<code>4827</code>')
    })

    it('пример в ненастроенную тему даёт понятную ошибку', async () => {
      const { n } = setup()
      await expect(n.sendSample('lesson')).rejects.toThrow(/не настроена/)
    })
  })
})
