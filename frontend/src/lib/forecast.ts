import type { WordStat } from '@/stores/progress'
import { plural } from './plural'

export interface VocabForecast {
  learned: number
  total: number
  /** слов в неделю за последние 30 дней */
  perWeek: number
  weeksLeft: number | null
  /** «через 3 месяца» и т. п., null — пока рано судить (нет темпа или словарь уже выучен) */
  eta: string | null
}

function etaLabel(weeks: number): string {
  if (weeks <= 8) return `через ${weeks} ${plural(weeks, ['неделю', 'недели', 'недель'])}`
  const months = Math.round(weeks / 4.345)
  if (months <= 18) return `через ${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])}`
  const years = Math.max(1, Math.round(months / 12))
  return `через ${years} ${plural(years, ['год', 'года', 'лет'])}`
}

/** Прогноз «когда выучишь весь словарь» по темпу выученных слов (`kd`) за последние 30 дней. */
export function vocabForecast(words: Record<string, WordStat>, total: number, now = Date.now()): VocabForecast {
  const kds = Object.values(words)
    .map(w => w.kd)
    .filter((x): x is number => !!x)
  const learned = kds.length
  const since = now - 30 * 86_400_000
  const recent = kds.filter(t => t >= since).length
  const perWeek = Math.round((recent / (30 / 7)) * 10) / 10
  const left = Math.max(0, total - learned)
  const weeksLeft = left > 0 && perWeek > 0 ? Math.ceil(left / perWeek) : null
  return { learned, total, perWeek, weeksLeft, eta: weeksLeft ? etaLabel(weeksLeft) : null }
}
