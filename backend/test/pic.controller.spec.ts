import { describe, expect, it, vi } from 'vitest'
import { PicController } from '../src/pic/pic.controller'

const res = () => ({ setHeader: vi.fn(), redirect: vi.fn() })

describe('картинки грамматики с Диска', () => {
  it('перенаправляет на ссылку Диска только для известных имён', async () => {
    const disk = { configured: () => true, cachedLink: vi.fn().mockResolvedValue('https://disk.example/x') }
    const c = new PicController(disk as never)
    const r = res()
    await c.grammar('own-hago.webp', r as never)
    expect(disk.cachedLink).toHaveBeenCalledWith('korean_grammar/own-hago.webp')
    expect(r.redirect).toHaveBeenCalledWith(302, 'https://disk.example/x')
    for (const bad of ['../etc/passwd', 'own-hago.png', 'lesson-123.webp', 'x.webp']) await expect(c.grammar(bad, res() as never)).rejects.toThrow()
  })

  it('без Диска или без файла отвечает 404', async () => {
    await expect(new PicController({ configured: () => false } as never).grammar('own-hago.webp', res() as never)).rejects.toThrow()
    const miss = { configured: () => true, cachedLink: vi.fn().mockRejectedValue(new Error('нет')) }
    await expect(new PicController(miss as never).grammar('lesson-1.webp', res() as never)).rejects.toThrow()
  })
})
