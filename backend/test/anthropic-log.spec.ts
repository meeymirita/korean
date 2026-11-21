import { describe, expect, it, vi } from 'vitest'
import { AuthGuard } from '../src/auth/auth.guard'
import { INBOX_READ } from '../src/auth/auth'
import { describeClient, isAnthropicIp, RateLimiter } from '../src/security'

// Журнал запросов приложения Claude (адреса Anthropic) и неверных токенов: без базы и сети.
const req = (over: Record<string, unknown> = {}) =>
  ({ ip: '160.79.106.142', method: 'GET', path: '/api/new-words', headers: { authorization: 'Bearer abc', 'user-agent': 'Claude-User/1.0 (compatible)' }, socket: {}, ...over }) as never

describe('адреса Anthropic', () => {
  it('сеть 160.79.104.0/21 распознаётся, чужие нет', () => {
    for (const ok of ['160.79.104.1', '160.79.106.142', '160.79.111.255', '::ffff:160.79.106.26']) expect(isAnthropicIp(ok), ok).toBe(true)
    for (const bad of ['160.79.103.255', '160.79.112.0', '8.8.8.8', '', 'unknown', '::1']) expect(isAnthropicIp(bad), bad).toBe(false)
  })

  it('описание запроса: адрес с пометкой, метод, путь без параметров и токена, начало User-Agent', () => {
    const text = describeClient(req({ path: '/api/new-words' }))
    expect(text).toBe('160.79.106.142 [Anthropic] GET /api/new-words · Claude-User/1.0 (compatible)')
    expect(text).not.toContain('abc')
    expect(describeClient(req({ ip: '1.2.3.4', headers: {} }))).toBe('1.2.3.4 GET /api/new-words')
  })
})

function guard(over: { who?: unknown; scope?: 'read' | 'write' | null; expired?: boolean; read?: boolean } = {}) {
  const events = { log: vi.fn(async () => {}) }
  const auth = {
    whoIs: async () => over.who ?? null,
    inboxScope: async () => over.scope ?? null,
    inboxExpired: async () => over.expired ?? false,
  }
  const reflector = { getAllAndOverride: (key: unknown) => (key === INBOX_READ ? (over.read ?? true) : false) }
  const limiter = new RateLimiter()
  const g = new AuthGuard(reflector as never, auth as never, events as never, limiter as never, { required: async () => false } as never)
  const ctx = (r: unknown) => ({ getHandler: () => 0, getClass: () => 0, switchToHttp: () => ({ getRequest: () => r }) }) as never
  return { g, events, ctx }
}

describe('журнал входов и запросов приложения', () => {
  it('запрос с временным токеном «Входящих» пишется в журнал с адресом и путём; повтор за минуту не дублируется в таблице', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { g, events, ctx } = guard({ scope: 'read' })
    expect(await g.canActivate(ctx(req()))).toBe(true)
    expect(await g.canActivate(ctx(req()))).toBe(true)
    expect(events.log).toHaveBeenCalledTimes(1)
    expect(events.log).toHaveBeenCalledWith('inbox_ok', '160.79.106.142 [Anthropic] GET /api/new-words · Claude-User/1.0 (compatible) (read)', '')
  })

  it('запрещённый маршрут с токеном «Входящих»: запись inbox_denied и 403', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { g, events, ctx } = guard({ scope: 'read', read: false })
    await expect(g.canActivate(ctx(req({ method: 'DELETE', path: '/api/notes/1' })))).rejects.toThrow()
    expect(events.log).toHaveBeenCalledWith('inbox_denied', expect.stringContaining('[Anthropic] DELETE /api/notes/1'), '160.79.106.142')
  })

  it('просроченный токен «Входящих»: inbox_expired, 401, адрес не считается подбором', async () => {
    const { g, events, ctx } = guard({ expired: true })
    for (let i = 0; i < 20; i++) await expect(g.canActivate(ctx(req()))).rejects.toThrow()
    expect(events.log).toHaveBeenCalledTimes(20)
    expect(events.log).toHaveBeenCalledWith('inbox_expired', expect.stringContaining('[Anthropic] GET /api/new-words'), '')
    expect(events.log).not.toHaveBeenCalledWith('ip_locked', expect.anything(), expect.anything())
  })

  it('неверный токен: bad_token с подробностями в журнале, а в оповещение уходит только адрес', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { g, events, ctx } = guard()
    await expect(g.canActivate(ctx(req({ ip: '5.5.5.5', headers: { authorization: 'Bearer zzz' } })))).rejects.toThrow()
    expect(events.log).toHaveBeenCalledWith('bad_token', '5.5.5.5 GET /api/new-words', '5.5.5.5')
  })
})
