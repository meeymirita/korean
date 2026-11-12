import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PicController } from '../src/pic/pic.controller'
import { YaDiskService } from '../src/yadisk/yadisk.service'

const res = () => ({ setHeader: vi.fn(), redirect: vi.fn() })

describe('картинки грамматики с Диска', () => {
  it('перенаправляет на ссылку Диска только для известных имён', async () => {
    const disk = { configured: () => true, cachedLink: vi.fn().mockResolvedValue('https://disk.example/x') }
    const c = new PicController(disk as never)
    const r = res()
    await c.grammar('own-hago.webp', undefined, r as never)
    expect(disk.cachedLink).toHaveBeenCalledWith('korean_grammar/own-hago.webp', false)
    expect(r.redirect).toHaveBeenCalledWith(302, 'https://disk.example/x')
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=600')
    for (const bad of ['../etc/passwd', 'own-hago.png', 'lesson-123.webp', 'x.webp']) await expect(c.grammar(bad, undefined, res() as never)).rejects.toThrow()
  })

  it('?fresh просит новую ссылку (файл на Диске заменили) и не даёт браузеру запомнить перенаправление', async () => {
    const disk = { configured: () => true, cachedLink: vi.fn().mockResolvedValue('https://disk.example/y') }
    const r = res()
    await new PicController(disk as never).grammar('own-here.webp', '1731250000000', r as never)
    expect(disk.cachedLink).toHaveBeenCalledWith('korean_grammar/own-here.webp', true)
    expect(r.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('без Диска или без файла отвечает 404', async () => {
    await expect(new PicController({ configured: () => false } as never).grammar('own-hago.webp', undefined, res() as never)).rejects.toThrow()
    const miss = { configured: () => true, cachedLink: vi.fn().mockRejectedValue(new Error('нет')) }
    await expect(new PicController(miss as never).grammar('lesson-1.webp', undefined, res() as never)).rejects.toThrow()
  })
})

describe('владелец управляет картинками грамматики', () => {
  afterEach(() => vi.unstubAllEnvs())

  const setup = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pic-'))
    vi.stubEnv('YADISK_DUMP_DIR', dir)
    return { dir, c: new PicController(new YaDiskService()) }
  }
  const png = (width: number) => sharp({ create: { width, height: 40, channels: 3, background: '#f6c' } }).png().toBuffer()
  const file = (buffer: Buffer) => ({ buffer, size: buffer.length }) as never

  it('загрузка кладёт webp шириной не больше 1280 в korean_grammar, список и ссылка обновляются', async () => {
    const { dir, c } = setup()
    expect(await c.list()).toEqual({ keys: [] })
    expect(await c.upload('own-hago', file(await png(2000)))).toEqual({ keys: ['own-hago'] })
    const saved = path.join(dir, 'korean_grammar', 'own-hago.webp')
    const meta = await sharp(readFileSync(saved)).metadata()
    expect([meta.format, meta.width]).toEqual(['webp', 1280])
    await c.upload('lesson-3', file(await png(300)))
    expect((await sharp(readFileSync(path.join(dir, 'korean_grammar', 'lesson-3.webp'))).metadata()).width).toBe(300)
    expect(await c.list()).toEqual({ keys: ['lesson-3', 'own-hago'] })
  })

  it('удаление убирает файл и имя из списка', async () => {
    const { dir, c } = setup()
    await c.upload('own-man', file(await png(100)))
    expect(await c.remove('own-man')).toEqual({ keys: [] })
    expect(existsSync(path.join(dir, 'korean_grammar', 'own-man.webp'))).toBe(false)
    expect(await c.list()).toEqual({ keys: [] })
  })

  it('замена файла сбрасывает ссылку из памяти', async () => {
    const disk = { configured: () => true, put: vi.fn(), remove: vi.fn(), forgetLink: vi.fn(), list: vi.fn().mockResolvedValue([]) }
    const c = new PicController(disk as never)
    await c.upload('own-hago', file(await png(50)))
    await c.remove('own-hago')
    expect(disk.forgetLink).toHaveBeenCalledTimes(2)
    expect(disk.remove).toHaveBeenCalledWith('korean_grammar/own-hago.webp', false)
  })

  it('не принимает чужие имена, не картинки и пустой запрос', async () => {
    const { c } = setup()
    await expect(c.upload('../x', file(await png(50)))).rejects.toThrow()
    await expect(c.upload('own-Hago', file(await png(50)))).rejects.toThrow()
    await expect(c.upload('own-hago', file(Buffer.from('это не картинка')))).rejects.toThrow()
    await expect(c.upload('own-hago', undefined)).rejects.toThrow()
    await expect(c.remove('own-hago.webp')).rejects.toThrow()
  })

  it('без Диска списка нет, загрузка отвечает ошибкой', async () => {
    vi.stubEnv('YADISK_DUMP_DIR', '')
    vi.stubEnv('YADISK_TOKEN', '')
    const c = new PicController(new YaDiskService())
    await expect(c.list()).rejects.toThrow()
    await expect(c.upload('own-hago', file(await png(50)))).rejects.toThrow()
  })
})
