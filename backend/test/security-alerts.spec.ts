import { afterEach, describe, expect, it, vi } from 'vitest'
import { Events } from '../src/events/events.service'
import { securityMail } from '../src/mail/templates'

// Оповещения о событиях защиты: чистая логика без базы и Telegram.
function make() {
  const sent: Array<[string, string, string]> = []
  const notify = { sendSecurity: vi.fn(async (t: string, title: string, lead: string) => { sent.push([t, title, lead]) }) }
  const db = { orm: async () => ({ event: { create: async () => ({}), deleteMany: async () => ({}), aggregate: async () => ({ _max: { id: null } }) } }) }
  return { ev: new Events(db as never, notify as never), sent, notify }
}

describe('оповещения о защите', () => {
  afterEach(() => { delete process.env.SECURITY_ALERTS; vi.restoreAllMocks() })

  it('неверный код с адреса уходит в «Тревоги» с адресом', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ev, sent } = make()
    await ev.log('2fa_bad_code', '5.44.168.101')
    expect(sent).toEqual([['alert', 'Неверный код второго шага', 'Адрес: 5.44.168.101.']])
  })

  it('вход по коду уходит в «Вход», обычные события молчат', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ev, sent } = make()
    await ev.log('code_login', 'telegram')
    await ev.log('code_sent', 'telegram')
    await ev.log('login', 'владелец')
    expect(sent.map(s => s[0])).toEqual(['login'])
  })

  it('одинаковое событие не чаще раза в 10 минут, другой адрес отдельно', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ev, sent } = make()
    await ev.log('bad_token', '1.1.1.1')
    await ev.log('bad_token', '1.1.1.1')
    await ev.log('bad_token', '2.2.2.2')
    expect(sent.length).toBe(2)
  })

  it('SECURITY_ALERTS=0 выключает; без Telegram событие всё равно пишется', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.SECURITY_ALERTS = '0'
    const off = make()
    await off.ev.log('bad_token', '3.3.3.3')
    expect(off.sent).toEqual([])
    delete process.env.SECURITY_ALERTS
    const db = { orm: async () => ({ event: { create: vi.fn(async () => ({})), deleteMany: async () => ({}), aggregate: async () => ({ _max: { id: null } }) } }) }
    await expect(new Events(db as never).log('bad_token', '4.4.4.4')).resolves.toBeUndefined()
  })

  it('сообщение: заголовок, адрес и напоминание про смену токена', () => {
    const m = securityMail('alert', 'Неверный токен', 'Адрес: 1.2.3.4.')
    expect(m.topic).toBe('alert')
    expect(m.tg?.html).toContain('Неверный токен')
    expect(m.tg?.html).toContain('1.2.3.4')
    expect(m.tg?.html).toContain('смените токен')
  })
})
