import { describe, expect, it, vi } from 'vitest'
import { DictController } from '../src/dict/dict.controller'
import { MetricsController } from '../src/metrics.controller'
import { isInternal, isPrivateAddress } from '../src/security'

const req = (remoteAddress: string, headers: Record<string, string> = {}) => ({ headers, socket: { remoteAddress } }) as never

describe('внутренние адреса API: только из своей сети и без прокси', () => {
  it('частные адреса отличает от внешних', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.0.5', '172.18.0.3', '::ffff:172.31.255.1', '192.168.1.7', 'fd12:3456::1', 'fe80::1']) expect(isPrivateAddress(a), a).toBe(true)
    for (const a of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '193.168.1.1', '2a02:6b8::1', '', 'unknown']) expect(isPrivateAddress(a), a).toBe(false)
  })

  it('запрос через прокси или с внешнего адреса внутренним не считается', () => {
    expect(isInternal(req('172.18.0.3'))).toBe(true)
    expect(isInternal(req('172.18.0.3', { 'x-forwarded-for': '8.8.8.8' }))).toBe(false)
    expect(isInternal(req('172.18.0.3', { forwarded: 'for=8.8.8.8' }))).toBe(false)
    expect(isInternal(req('172.18.0.3', { 'x-real-ip': '8.8.8.8' }))).toBe(false)
    expect(isInternal(req('8.8.8.8'))).toBe(false)
  })

  it('метрики снаружи отвечают 404', () => {
    const c = new MetricsController({ render: () => 'a\n' } as never, { render: () => 'b\n' } as never)
    expect(c.render(req('127.0.0.1'))).toBe('a\nb\n')
    expect(() => c.render(req('127.0.0.1', { 'x-forwarded-for': '8.8.8.8' }))).toThrow()
    expect(() => c.render(req('8.8.8.8'))).toThrow()
  })

  it('учёт заходов словаря принимает запись только изнутри', async () => {
    const visits = { record: vi.fn(async () => true) }
    const c = new DictController({} as never, visits as never)
    await c.visit(req('172.18.0.4'), { path: '/dict' })
    expect(visits.record).toHaveBeenCalledOnce()
    await expect(c.visit(req('172.18.0.4', { 'x-forwarded-for': '8.8.8.8' }), { path: '/dict' })).rejects.toThrow()
    await expect(c.visit(req('8.8.8.8'), { path: '/dict' })).rejects.toThrow()
    expect(visits.record).toHaveBeenCalledOnce()
  })
})
