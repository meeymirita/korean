import { describe, expect, it } from 'vitest'
import { showFixedFab } from '@/lib/fab'

// Закреплённые кнопки плеера и голоса: на каких страницах их нет.
describe('закреплённые кнопки плеера и голоса', () => {
  it('нет на главной, росте, «О платформе», истории, словаре и в разделах', () => {
    for (const p of ['/', '/growth', '/about', '/history', '/dict', '/dict/가다', '/dict/podborki/top-100', '/dict/a/가', '/korean/home', '/game/home']) expect(showFixedFab(p), p).toBe(false)
  })
  it('есть на остальных открытых страницах', () => {
    for (const p of ['/me', '/ru', '/ru/привет', '/upload']) expect(showFixedFab(p), p).toBe(true)
  })
  it('похожий префикс не считается: /aboutx, /dictionary', () => {
    expect(showFixedFab('/aboutx')).toBe(true)
    expect(showFixedFab('/dictionary')).toBe(true)
  })
})
