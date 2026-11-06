import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { YaDiskService } from '../src/yadisk/yadisk.service'

describe('Яндекс.Диск без сети (YADISK_DUMP_DIR)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('настроен только с токеном или тестовой папкой', () => {
    vi.stubEnv('YADISK_TOKEN', '')
    vi.stubEnv('YADISK_DUMP_DIR', '')
    expect(new YaDiskService().configured()).toBe(false)
    vi.stubEnv('YADISK_TOKEN', 'x')
    expect(new YaDiskService().configured()).toBe(true)
  })

  it('загружает, показывает, скачивает и удаляет файл', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yadisk-'))
    vi.stubEnv('YADISK_DUMP_DIR', path.join(dir, 'disk'))
    const src = path.join(dir, 'a.txt')
    writeFileSync(src, 'привет')
    const d = new YaDiskService()
    await d.upload('База и env/a.txt', src)
    expect((await d.list('База и env')).map(i => i.name)).toEqual(['a.txt'])
    expect(await d.exists('База и env/a.txt')).toBe(true)
    await d.download('База и env/a.txt', path.join(dir, 'b.txt'))
    expect(readFileSync(path.join(dir, 'b.txt'), 'utf8')).toBe('привет')
    await d.remove('База и env/a.txt')
    expect(await d.exists('База и env/a.txt')).toBe(false)
  })
})
