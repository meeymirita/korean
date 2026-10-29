/** Уровни и цель дня: общие для всего сайта (игра, тренажёры, «Сегодня»). */

export const MAX_LEVEL = 40
/** Цель дня по умолчанию; в кабинете можно выбрать другую из GOAL_OPTIONS. */
export const DAILY_GOAL = 20
export const GOAL_OPTIONS = [10, 20, 50]

/** Очки, с которых начинается уровень L: растёт квадратично (2-й уровень — 60 очков, 40-й — около 47 тысяч). */
export const xpFor = (L: number) => 30 * L * (L - 1)

export const levelOf = (xp: number) => Math.min(MAX_LEVEL, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 30)) / 2))

/** Звания меняются каждые пять уровней; названия нейтральные по роду. */
const RANKS: [number, string][] = [
  [1, 'Искра'],
  [5, 'Огонёк'],
  [10, 'Свеча'],
  [15, 'Факел'],
  [20, 'Звезда'],
  [25, 'Луна'],
  [30, 'Рассвет'],
  [35, 'Созвездие'],
  [40, 'Вечность'],
]

export const rankOf = (level: number) => [...RANKS].reverse().find(([from]) => level >= from)![1]

export interface LevelInfo {
  level: number
  title: string
  /** очки внутри текущего уровня */
  into: number
  /** сколько очков нужно на этот уровень */
  span: number
  pct: number
  max: boolean
  xp: number
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelOf(xp)
  const into = xp - xpFor(level)
  const span = xpFor(level + 1) - xpFor(level)
  const max = level >= MAX_LEVEL
  return { level, title: rankOf(level), into, span, pct: max ? 100 : Math.min(100, (into / span) * 100), max, xp }
}
