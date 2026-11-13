import { KNOWN_STREAK, type ProgressData, type WordStat } from '@/stores/progress'
import { STUDY } from './study'
import { drillTasks } from './topics'
import type { Task } from './tasks'
import { CATN, type Word } from './words'

const DAY = 86_400_000

/** Слово считается давно не виденным, если последний ответ старше стольких дней. */
export const STALE_DAYS = 30
/** Сколько строк «Давно не видел» показано сразу (дальше «Показать ещё»). */
export const STALE_PAGE = 20
/** Сколько заданий в серии «Повторить их». */
export const STALE_DRILL = 15
/** Сколько слабых слов показывает «Над чем стоит поработать». */
export const WEAK_LIMIT = 12

export interface WeakWord {
  d: Word
  w: WordStat
}

/** Тема для фильтра: id из `CATN` или пусто («Все»). Всё остальное считается «Все». */
export const topicOrAll = (v: unknown): string => (typeof v === 'string' && v in CATN ? v : '')

/**
 * Слабые слова: ещё не выучены и в них были ошибки; сначала самые «минусовые».
 * Только слова для заданий (`STUDY`), при `topic` только этой темы.
 */
export function weakWords(p: ProgressData, topic = '', limit = WEAK_LIMIT, list: Word[] = STUDY): WeakWord[] {
  const seen = new Set<string>()
  const out: WeakWord[] = []
  for (const d of list) {
    const w = p.words[d.k]
    if (!w || w.streak >= KNOWN_STREAK || w.bad <= 0 || seen.has(d.k)) continue
    if (topic && !d.c.includes(topic)) continue
    seen.add(d.k)
    out.push({ d, w })
  }
  return out.sort((a, b) => b.w.bad - b.w.ok - (a.w.bad - a.w.ok) || b.w.bad - a.w.bad).slice(0, Math.max(0, limit))
}

export interface StaleWord {
  d: Word
  w: WordStat
  /** сколько полных дней прошло с последнего ответа */
  days: number
}

/**
 * Слова, на которые не отвечали дольше `days` дней (выученные тоже), самые давние первыми.
 * Слова без единого ответа (`last` пусто, ответов нет) не входят: забыть можно только то, что видел.
 * «Сейчас» передаётся параметром: на сервере даты нет.
 */
export function staleWords(p: ProgressData, now: number, days = STALE_DAYS, list: Word[] = STUDY): StaleWord[] {
  const seen = new Set<string>()
  const out: StaleWord[] = []
  for (const d of list) {
    const w = p.words[d.k]
    if (!w || seen.has(d.k) || !(w.last > 0) || w.ok + w.bad <= 0) continue
    if (now - w.last <= days * DAY) continue
    seen.add(d.k)
    out.push({ d, w, days: Math.floor((now - w.last) / DAY) })
  }
  return out.sort((a, b) => a.w.last - b.w.last || a.d.k.localeCompare(b.d.k))
}

/** Серия «Повторить их»: общий подбор `drillTasks` по всем давним словам (первыми самые слабые), не больше `size` заданий. */
export const staleTasks = (p: ProgressData, now: number, size = STALE_DRILL): Task[] =>
  drillTasks(p, staleWords(p, now).map(x => x.d), size)
