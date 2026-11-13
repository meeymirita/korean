import { ALL_GAMES } from '@/data/games'

/** Строка отчёта с сервера (`GET /api/report`): раздел + режим. */
export interface ReportRow {
  source: string
  mode: string
  ok: number
  bad: number
  days: number
  first: number
  last: number
  seconds: number
}

/** Названия разделов, откуда приходят ответы (`source`). */
export const SOURCE_NAMES: Record<string, string> = {
  game: 'Игры',
  trainer: 'Тренажёры',
  today: 'Сегодня',
  review: 'Повторение и «Мои ошибки»',
  quick: '5 минут',
}

/** Названия режимов, которых нет в каталоге игр. */
export const EXTRA_MODES: Record<string, string> = {
  match: 'Найди пару',
  typing: 'Напиши перевод',
  syllables: 'Собери по слогам',
  particles: 'Частицы и окончания',
  translate: 'Переведи предложение',
  pairs: 'Похожие, но разные',
  quick: '5 минут',
  mistakes: 'Мои ошибки',
  topic: 'Добить тему',
  cards: 'Повторение: карточки',
  'check-pairs': 'Проверка слов: найди пару',
  'check-quiz': 'Проверка слов: выбери перевод',
  'check-build': 'Проверка слов: собери слово',
}

export const modeName = (mode: string): string => (mode ? (ALL_GAMES.find(g => g.id === mode)?.name ?? EXTRA_MODES[mode] ?? mode) : 'без режима')
export const sourceName = (s: string): string => SOURCE_NAMES[s] ?? s

/** Грубые темы для «Дневника ошибок»: группируем похожие режимы, чтобы фильтр не разваливался на десятки пунктов. */
const MISTAKE_CATS: [string, string[]][] = [
  ['Частицы и окончания', ['part', 'pair', 'particles']],
  ['Порядок слов', ['ord', 'build']],
  ['Форма слова', ['form', 'type']],
  ['Перевод', ['word', 'rev', 'translate', 'typing']],
]
export const MISTAKE_CAT_NAMES = ['Все', ...MISTAKE_CATS.map(([name]) => name), 'Другое']
export const mistakeCatOf = (mode: string): string => MISTAKE_CATS.find(([, modes]) => modes.includes(mode))?.[0] ?? 'Другое'

export interface ReportGroup {
  source: string
  name: string
  ok: number
  bad: number
  seconds: number
  rows: (ReportRow & { name: string })[]
}

/** Строки по разделам: у раздела итог и его режимы (самые частые сверху). */
export function groupReport(rows: ReportRow[]): ReportGroup[] {
  const by = new Map<string, ReportGroup>()
  for (const r of rows) {
    let g = by.get(r.source)
    if (!g) by.set(r.source, (g = { source: r.source, name: sourceName(r.source), ok: 0, bad: 0, seconds: 0, rows: [] }))
    g.ok += r.ok
    g.bad += r.bad
    g.seconds += r.seconds
    g.rows.push({ ...r, name: modeName(r.mode) })
  }
  const total = (x: { ok: number; bad: number }) => x.ok + x.bad
  return [...by.values()].map(g => ({ ...g, rows: g.rows.sort((a, b) => total(b) - total(a)) })).sort((a, b) => total(b) - total(a))
}

/** Доля верных ответов, 0–100 (пусто, если ответов нет). */
export const percent = (ok: number, bad: number): number => (ok + bad ? Math.round((ok / (ok + bad)) * 100) : 0)

/** «1 ч 05 мин», «12 мин», «меньше минуты». */
export function spent(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 1) return sec > 0 ? 'меньше минуты' : '—'
  return m >= 60 ? `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, '0')} мин` : `${m} мин`
}
