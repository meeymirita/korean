import { createServer } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MailService } from '../src/mail/mail.service'

type FakeSmtp = { port: number; received: () => string; close: () => Promise<void> }

async function smtpFixture(rejectRecipient = false): Promise<FakeSmtp> {
  let transcript = ''
  let buffer = ''
  let inMessage = false
  const server = createServer(socket => {
    socket.write('220 test-smtp ESMTP ready\r\n')
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8')
      if (inMessage) {
        const end = buffer.indexOf('\r\n.\r\n')
        if (end < 0) return
        transcript = buffer.slice(0, end)
        buffer = buffer.slice(end + 5)
        inMessage = false
        socket.write('250 2.0.0 message accepted\r\n')
      }
      let lineEnd = buffer.indexOf('\r\n')
      while (lineEnd >= 0 && !inMessage) {
        const line = buffer.slice(0, lineEnd)
        buffer = buffer.slice(lineEnd + 2)
        if (/^EHLO\s/i.test(line) || /^HELO\s/i.test(line)) socket.write('250 test-smtp\r\n')
        else if (/^MAIL FROM:/i.test(line)) socket.write('250 2.1.0 sender accepted\r\n')
        else if (/^RCPT TO:/i.test(line)) socket.write(rejectRecipient ? '550 5.1.1 recipient rejected\r\n' : '250 2.1.5 recipient accepted\r\n')
        else if (/^DATA$/i.test(line)) {
          inMessage = true
          socket.write('354 end with <CRLF>.<CRLF>\r\n')
        } else if (/^RSET$/i.test(line)) socket.write('250 2.0.0 reset\r\n')
        else if (/^QUIT$/i.test(line)) {
          socket.write('221 2.0.0 closing connection\r\n')
          socket.end()
        }
        lineEnd = buffer.indexOf('\r\n')
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    port: (server.address() as { port: number }).port,
    received: () => transcript,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

describe.runIf(process.env.RUN_SMTP_INTEGRATION === '1')('SMTP через локальный фальшивый сервер', () => {
  let directory = ''
  let fixture: FakeSmtp | undefined

  afterEach(async () => {
    vi.unstubAllEnvs()
    if (fixture) await fixture.close()
    fixture = undefined
    if (directory) await rm(directory, { recursive: true, force: true })
    directory = ''
  })

  it('передаёт письмо с файлом и возвращает ошибку отказа получателя', async context => {
    directory = await mkdtemp(path.join(tmpdir(), 'smtp-test-'))
    const attachment = path.join(directory, 'backup.dump')
    await writeFile(attachment, 'дамп базы')
    try {
      fixture = await smtpFixture()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') context.skip('среда запрещает локальные TCP-сокеты')
      throw error
    }
    vi.stubEnv('MAIL_DUMP_FILE', '')
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    vi.stubEnv('SMTP_PORT', String(fixture.port))
    vi.stubEnv('SMTP_FROM', 'korean@example.test')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', '')

    await new MailService().send('owner@example.test', 'Резервная копия', 'Backup is attached', '<p>Backup is attached</p>', [{ filename: 'backup.dump', path: attachment }])
    expect(fixture.received()).toMatch(/To: owner@example\.test/i)
    expect(fixture.received()).toMatch(/Subject:/i)
    expect(fixture.received()).toMatch(/backup\.dump/)
    expect(fixture.received()).toContain('Backup is attached')

    await fixture.close()
    fixture = await smtpFixture(true)
    vi.stubEnv('SMTP_PORT', String(fixture.port))
    await expect(new MailService().send('bad@example.test', 'Тест', 'текст')).rejects.toThrow(/recipient rejected/i)
  })
})
