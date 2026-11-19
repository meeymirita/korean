import { afterEach, describe, expect, it } from 'vitest'
import { ICON } from '@/game/icons'
import { ICONS } from '@/lib/icons'
import { setTheme, themeHydrated, themeLight } from '@/lib/theme'
import { themed } from '@/lib/themed'

describe('картинки под тему', () => {
  afterEach(() => { themeLight.value = false })
  // по умолчанию флаг true (сервер рисует светлую версию): в тестах тёмной темы ставим false сами

  it('тёмные темы берут новый набор, светлая старый (`-light`)', () => {
    themeLight.value = false
    const dark = ICONS.coin
    themeLight.value = true
    const light = ICONS.coin
    expect(dark).toBeTruthy()
    expect(light).toBeTruthy()
    expect(light).not.toBe(dark)
    expect(light).toMatch(/coin-light/)
    themeLight.value = false
    expect(ICONS.coin).toBe(dark)
  })

  it('иконки игр и общий словарь тоже переключаются', () => {
    themeLight.value = false
    const dark = ICON.dice
    themeLight.value = true
    expect(ICON.dice).not.toBe(dark)
    expect(ICON.dice).toMatch(/dice-light/)
  })

  it('в словарях нет самих `-light` файлов как отдельных иконок', () => {
    expect(ICONS['coin-light']).toBeUndefined()
    expect(ICON['dice-light']).toBeUndefined()
  })

  it('адрес без светлой копии и пустой адрес остаются как есть', () => {
    themeLight.value = true
    expect(themed('/нет/такой.webp')).toBe('/нет/такой.webp')
    expect(themed(undefined)).toBe('')
  })

  it('флаг светлой темы следует за выбранной темой после оживления страницы', () => {
    setTheme('light')
    themeHydrated()
    expect(themeLight.value).toBe(true)
    setTheme('wine')
    expect(themeLight.value).toBe(false)
    setTheme('light')
    expect(themeLight.value).toBe(true)
    setTheme('wine')
  })
})
