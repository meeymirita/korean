import { sections } from './sections'

export interface Crumb {
  label: string
  /** у последней (текущей) крошки ссылки нет */
  to?: string
}

/** Страницы, открывающиеся из другой страницы: id родителя. Вкладки справочника (group 'ref') родителя получают отдельно. */
const PARENT: Record<string, string> = { particles: 'trainers', pairs: 'trainers', translate: 'trainers', syllables: 'trainers', forms: 'words' }

/** Вкладки кабинета (?tab=…); «Обзор» без параметра. */
export const CABINET_TABS: Record<string, string> = {
  repeat: 'Повторить',
  week: 'Неделя',
  history: 'История',
  notes: 'Заметки',
  images: 'Картинки',
  db: 'База',
  logs: 'Журналы',
  settings: 'Настройки',
}

/** Вкладки и режимы страниц, которые переключаются на месте, но записаны в адрес: id страницы → параметр и подписи значений. */
const PAGE_TABS: Record<string, { param: string; labels: Record<string, string> }> = {
  cabinet: { param: 'tab', labels: CABINET_TABS },
  today: { param: 'tab', labels: { list: 'Чек-лист', history: 'История' } },
  trainers: { param: 'mode', labels: { type: 'Напиши перевод' } },
}

const byId = (id: string) => sections.find(s => s.id === id)
const linkOf = (id: string) => (byId(id)?.group === 'ref' ? `/korean/ref/${id}` : `/korean/${id}`)

/** Хлебные крошки раздела корейского для адреса: «Главная › Справочник › Числа». На главной раздела и неизвестных адресах пусто. */
export function crumbsFor(path: string, query: Record<string, unknown> = {}): Crumb[] {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts[0] !== 'korean' || parts.length < 2) return []
  const id = parts[parts.length - 1]!
  if (id === 'home' || id === 'ref') return id === 'ref' ? [{ label: 'Главная', to: '/korean/home' }, { label: 'Справочник' }] : []
  const sec = byId(id)
  if (!sec) return []
  const home: Crumb = { label: 'Главная', to: '/korean/home' }
  const parentId = sec.group === 'ref' ? 'ref' : PARENT[id]
  const trail: Crumb[] = [home]
  if (parentId) {
    const p = byId(parentId)!
    trail.push({ label: p.menu, to: linkOf(parentId) })
  }
  const pt = PAGE_TABS[id]
  const v = pt ? query[pt.param] : undefined
  const tab = pt && typeof v === 'string' ? pt.labels[v] : undefined
  if (tab) trail.push({ label: sec.menu, to: linkOf(id) }, { label: tab })
  else trail.push({ label: sec.menu })
  return trail
}
