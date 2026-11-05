import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpsReportService, hide } from '../src/admin/ops-report.service'

afterEach(() => vi.unstubAllGlobals())

describe('отчёт для разбора неполадок', () => {
  it('прячет токены, пароли и длинные ключи', () => {
    expect(hide('Authorization: Bearer abcdefghijklmnop1234567890')).not.toContain('abcdefghijklmnop')
    expect(hide('password=SuperSecretValue12345 и token: aaaaaaaaaaaaaaaaaaaa')).not.toMatch(/SuperSecret|aaaaaaaa/)
    expect(hide('хэш ' + 'a1b2c3d4'.repeat(8))).toContain('***')
    expect(hide('обычная строка про ошибку подключения')).toBe('обычная строка про ошибку подключения')
  })

  it('собирает отчёт со службами, нагрузкой и ошибками из журналов', async () => {
    const ops = {
      services: async () => ({ services: [{ name: 'backend', state: 'running', health: 'healthy', status: 'Up' }, { name: 'redis', state: 'exited', health: 'unknown', status: 'Exited (1)' }] }),
      logs: async () => ({ logs: 'всё хорошо\nERROR: что-то сломалось token=zzzzzzzzzzzzzzzzzzzz\n INFO A batch of tasks was completed with 1 successful tasks and 0 failed tasks.\nlevel=info msg="Request Completed" status=404\nещё строка' }),
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { result: [{ value: [0, '42'] }] } }))))
    const db = { orm: async () => ({ event: { findMany: async () => [{ t: BigInt(1793900000000), type: 'bad_token', info: '1.2.3.4' }] } }) }
    const text = await new OpsReportService(db as never, ops as never).build(true)
    expect(text).toContain('# Отчёт о состоянии')
    expect(text).toContain('**Проблемные службы:** redis')
    expect(text).toContain('Процессор занят: 42%')
    expect(text).toContain('bad_token: 1.2.3.4')
    expect(text).toContain('ERROR: что-то сломалось')
    expect(text).not.toContain('zzzzzzzz')
    expect(text).not.toContain('0 failed tasks')
    expect(text).not.toContain('Request Completed')
  })
})
