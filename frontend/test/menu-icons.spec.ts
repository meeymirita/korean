import { describe, expect, it } from 'vitest'
import { MENU_ICONS, sections } from '@/data/korean/sections'
import { ICONS } from '@/lib/icons'

// Значки пунктов бокового меню: у каждого свой, и такая картинка есть.
describe('значки пунктов меню', () => {
  it('каждый значок существует среди иконок платформы', () => {
    for (const [id, name] of Object.entries(MENU_ICONS)) expect(ICONS[name], `у «${id}» нет иконки «${name}»`).toBeTruthy()
  })

  it('значки не повторяются: Помощник, Магазин и Итоговая оценка больше не одинаковые звёзды', () => {
    const names = Object.values(MENU_ICONS)
    expect(new Set(names).size, 'повторяющиеся значки: ' + names.filter((n, i) => names.indexOf(n) !== i).join(', ')).toBe(names.length)
    expect(new Set([MENU_ICONS.chat, MENU_ICONS.shop, MENU_ICONS.exam]).size).toBe(3)
  })

  it('у каждого раздела, который идёт в меню отдельным пунктом, значок задан (иначе «звезда» по умолчанию)', () => {
    for (const id of ['home', 'cabinet', 'today', 'words', 'grammar', 'ref', 'review', 'chat', 'shop', 'garden', 'exam']) {
      expect(sections.some(s => s.id === id), id).toBe(true)
      expect(MENU_ICONS[id], id).toBeTruthy()
    }
  })
})
