import { describe, expect, it } from 'vitest'
import { closeHelp, start } from './game-helpers'

// «Найди ошибки в тексте» и «Лишнее предложение»: у каждого предложения вердикт плиткой.
describe('режимы с вердиктом по предложению', () => {
  const tiles = () => [...document.querySelectorAll<HTMLButtonElement>('#bank .tile')]
  const tileOf = (t: string) => tiles().find(x => (x.textContent ?? '').includes(t))!
  const gaps = () => [...document.querySelectorAll<HTMLButtonElement>('.story .gap')]

  it('«Найди ошибки»: 6–8 предложений, в конце проверка', () => {
    for (let i = 0; i < 5; i++) {
      start('finderr')
      closeHelp()
      expect(gaps().length).toBeGreaterThanOrEqual(6)
      expect(gaps().length).toBeLessThanOrEqual(8)
      for (const g of gaps()) { tileOf('верно').click(); g.click() }
      const check = document.querySelector<HTMLButtonElement>('#schk')!
      expect(check.disabled).toBe(false)
      check.click()
      expect(document.querySelectorAll('.story .gap.bad').length, 'хотя бы одна ошибка в тексте отмечена неверно').toBeGreaterThan(0)
    }
  })

  it('«Лишнее предложение»: ровно одно лишнее', () => {
    for (let i = 0; i < 5; i++) {
      start('oddone')
      closeHelp()
      expect(gaps().length).toBeGreaterThanOrEqual(6)
      expect(gaps().length).toBeLessThanOrEqual(7)
      for (const g of gaps()) { tileOf('подходит').click(); g.click() }
      document.querySelector<HTMLButtonElement>('#schk')!.click()
      expect(document.querySelectorAll('.story .gap.bad').length).toBe(1)
    }
  })
})
