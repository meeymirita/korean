import { sections } from './korean/sections'
import { CABINET_TABS } from './korean/crumbs'

export interface ShortcutItem {
  id: string
  label: string
  /** куда ведёт сочетание */
  to: string
  group: 'menu' | 'cabinet'
}

/** Всё, что можно повесить на сочетание: пункты бокового меню и вкладки кабинета (в том же порядке, что на сайте). */
export const SHORTCUT_ITEMS: ShortcutItem[] = [
  ...sections
    .filter(s => !s.group)
    .flatMap<ShortcutItem>(s => [
      { id: `nav:${s.id}`, label: s.menu, to: `/korean/${s.id}`, group: 'menu' },
      ...(s.id === 'today' ? [{ id: 'nav:game', label: 'Игра на слова', to: '/game', group: 'menu' as const }] : []),
    ]),
  { id: 'cab:overview', label: 'Обзор', to: '/korean/cabinet', group: 'cabinet' },
  ...Object.entries(CABINET_TABS).map<ShortcutItem>(([tab, label]) => ({ id: `cab:${tab}`, label, to: `/korean/cabinet?tab=${tab}`, group: 'cabinet' })),
]

export const SHORTCUT_IDS = SHORTCUT_ITEMS.map(i => i.id)
export const SHORTCUT_LABELS: Record<string, string> = Object.fromEntries(
  SHORTCUT_ITEMS.map(i => [i.id, i.group === 'cabinet' ? `Кабинет: ${i.label}` : i.label]),
)
