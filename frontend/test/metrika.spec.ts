import { describe, expect, it } from 'vitest'
import { isOpenPath } from '@/lib/metrika'

// Вебвизор Метрики видит только открытые страницы; всё под токеном и оболочка /korean закрыты.
describe('Метрика: какие страницы открыты', () => {
  it('открытые', () => {
    for (const p of ['/', '/about', '/history', '/growth', '/me', '/dict', '/dict/podborki', '/dict/%EC%82%AC%EB%9E%8C', '/ru', '/ru/kot']) expect(isOpenPath(p), p).toBe(true)
  })
  it('закрытые', () => {
    for (const p of ['/korean/home', '/korean/chat', '/korean/talks', '/korean/map', '/game/home', '/upload', '/aboutx', '/meeting']) expect(isOpenPath(p), p).toBe(false)
  })
})
