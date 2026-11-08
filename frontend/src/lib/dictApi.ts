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
export interface DictWord { word: string; entries: DictEntry[]; related: DictRelated[] }

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
