/** Типы и запросы большого словаря (ответы сервера backend/src/dict). */
import { errText, fetchT } from '@/lib/http'

export interface DictRu { t: string; d: string }
export interface DictHitSense { ko: string; ru: DictRu[]; sent: string[] }
export interface DictHit {
  id: string
  word: string
  hom: number
  posKo: string
  pos: string
  level: string
  levelRank: number
  pron: string
  cat: string
  ru: string
  forms: string[]
  wordLen: number
  senses: DictHitSense[]
  moreSenses: number
}
export interface DictSearch {
  query: string
  hits: DictHit[]
  total: number
  limit: number
  offset: number
  via?: { typed: string; forms: string[] }
  facets: { level: Record<string, number>; pos: Record<string, number> }
}

export interface DictFullSense extends DictHitSense { phr: string[]; dial: string[] }
export interface DictEntry extends Omit<DictHit, 'senses' | 'moreSenses'> { def: string; senses: DictFullSense[] }
export interface DictRelated { word: string; pos: string; level: string; ru: string }
export interface DictWord { word: string; entries: DictEntry[]; related: DictRelated[]; similar?: DictRelated[]; category?: string }

export const LEVELS = ['начальный', 'средний', 'высокий', 'нет'] as const

export async function searchDict(q: string, level: string, pos: string, offset: number, signal?: AbortSignal): Promise<DictSearch> {
  const p = new URLSearchParams({ q })
  if (level) p.set('level', level)
  if (pos) p.set('pos', pos)
  if (offset) p.set('offset', String(offset))
  let res: Response
  try {
    res = await fetchT(`/api/dict/search?${p}`, { signal })
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `ошибка ${res.status}`)
  return res.json()
}

/** Главная запись слова: с самым высоким уровнем, при равенстве с меньшим номером омонима. */
export const mainEntry = (entries: DictEntry[]) => [...entries].sort((a, b) => b.levelRank - a.levelRank || a.hom - b.hom)[0]

export interface DictListItem { id: string; word: string; hom: number; pos: string; level: string; ru: string }
export interface DictList { items: DictListItem[]; total: number; limit: number; offset: number }

/** Меню слева: все слова порциями, по «популярности» (pop) или по алфавиту (abc). */
export async function listDict(order: 'pop' | 'abc', level: string, pos: string, offset: number, limit = 40): Promise<DictList> {
  const p = new URLSearchParams({ order, offset: String(offset), limit: String(limit) })
  if (level) p.set('level', level)
  if (pos) p.set('pos', pos)
  let res: Response
  try {
    res = await fetchT(`/api/dict/list?${p}`)
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `ошибка ${res.status}`)
  return res.json()
}

/** Полная статья слова (страница слова) → сокращённая запись для карточки в списках. */
export async function loadCards(word: string): Promise<DictHit[]> {
  let res: Response
  try {
    res = await fetchT(`/api/dict/word/${encodeURIComponent(word)}`)
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `ошибка ${res.status}`)
  const w = (await res.json()) as DictWord
  return w.entries.map(({ def: _def, senses, ...rest }) => ({
    ...rest,
    senses: senses.slice(0, 4).map(s => ({ ko: s.ko, ru: s.ru, sent: s.sent.slice(0, 1) })),
    moreSenses: Math.max(0, senses.length - 4),
  }))
}

export interface DictFolders { total: number; level: Record<string, number>; pos: Record<string, number> }

/** Сколько слов в каждой папке меню (уровни и части речи). */
export async function loadFolders(): Promise<DictFolders> {
  let res: Response
  try {
    res = await fetchT('/api/dict/folders')
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `ошибка ${res.status}`)
  return res.json()
}

export interface DictCollectionItem { word: string; hom: number; pron: string; pos: string; level: string; ru: string; grade?: string }
export interface DictCollection {
  slug: string
  title: string
  seoTitle: string
  description: string
  intro: string
  items: DictCollectionItem[]
  others: { slug: string; title: string }[]
}
export interface DictCollectionInfo { slug: string; title: string; description: string; count: number }
