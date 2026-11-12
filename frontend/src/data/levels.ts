/** Уровни и цель дня: общие для всего сайта (игра, тренажёры, «Сегодня»). */

export const MAX_LEVEL = 100
/** Цель дня по умолчанию; в кабинете можно выбрать другую из GOAL_OPTIONS. */
export const DAILY_GOAL = 20
export const GOAL_OPTIONS = [10, 20, 50]

/** Очки, с которых начинается уровень L: растёт квадратично (2-й уровень — 60 очков, 40-й — около 47 тысяч, 100-й — 297 тысяч). */
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
  [40, 'Солнце'],
  [45, 'Метеор'],
  [50, 'Комета'],
  [55, 'Северное сияние'],
  [60, 'Млечный Путь'],
  [65, 'Галактика'],
  [70, 'Туманность'],
  [75, 'Сверхновая'],
  [80, 'Космос'],
  [85, 'Вселенная'],
  [90, 'Бесконечность'],
  [95, 'Легенда'],
  [100, 'Вечность'],
]

const rankAt = (level: number) => [...RANKS].reverse().find(([from]) => level >= from) ?? RANKS[0]!
export const rankOf = (level: number) => rankAt(level)[1]
/** Первый уровень звания, к которому относится уровень: по нему названа картинка звания (`assets/levels/rank-<N>.webp`). */
export const rankStart = (level: number) => rankAt(level)[0]

/** Все звания с границами: с какого и по какой уровень, сколько очков нужно на первый уровень звания. */
export function rankTable() {
  return RANKS.map(([from, name], i) => {
    const to = i + 1 < RANKS.length ? RANKS[i + 1]![0] - 1 : MAX_LEVEL
    return { name, from, to, levels: Array.from({ length: to - from + 1 }, (_, k) => ({ level: from + k, xp: xpFor(from + k) })) }
  })
}

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
