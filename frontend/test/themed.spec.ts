import { describe, expect, it } from 'vitest'
import { ICON } from '@/game/icons'
import { ICONS } from '@/lib/icons'
import { themed } from '@/lib/themed'

describe('картинки: тема одна, светлая', () => {
  it('иконки берутся из набора `-light`', () => {
    expect(ICONS.coin).toMatch(/coin-light/)
    expect(ICON.dice).toMatch(/dice-light/)
  })

  it('в словарях нет самих `-light` файлов как отдельных иконок', () => {
    expect(ICONS['coin-light']).toBeUndefined()
    expect(ICON['dice-light']).toBeUndefined()
  })

  it('адрес без светлой копии и пустой адрес остаются как есть', () => {
    expect(themed('/нет/такой.webp')).toBe('/нет/такой.webp')
    expect(themed(undefined)).toBe('')
  })
})
