import { ALL_GAMES } from '@/data/games'
import type { LogEntry } from '@/stores/progress'

/** Пункт чек-листа на день. source — откуда считаем ответы сами, без source отметка ручная. */
export interface CheckItem {
  id: string
  text: string
  to: string
  goal: number
  source?: string
  /** режим внутри источника: ответы считаются только с ним (иначе все ответы источника) */
  mode?: string
}

/** Что пишем в историю по каждому пункту. */
export interface CheckSnap {
  text: string
  to: string
  goal: number
  have: number
  done: boolean
  manual: boolean
}

/** Сколько ответов в одной игре просят за день: от 15 до 50. */
const GAME_GOALS = [15, 20, 25, 30, 40, 50]

/** Откуда журнал ответов знает игру: источник и режим (`record({ source, mode })`). Остальные игры каталога идут как режимы движка («game» + id). */
const TRAINER: Record<string, { source: string; mode?: string }> = {
  match: { source: 'trainer', mode: 'match' },
  typewords: { source: 'trainer', mode: 'typing' },
  pairs: { source: 'trainer', mode: 'pairs' },
  syllables: { source: 'trainer', mode: 'syllables' },
  particles: { source: 'trainer', mode: 'particles' },
  rule: { source: 'trainer', mode: 'rule' },
  translate: { source: 'trainer', mode: 'translate' },
  quick: { source: 'quick' },
}

interface Entry {
  hand: boolean
  goals: number[]
  make: (n: number) => Omit<CheckItem, 'id'>
}

/** Все пункты, которые бывают в чек-листе: каждая игра каталога (`ALL_GAMES`) со своим счётчиком, повторение ошибок, страница «Сегодня» и три ручных. */
const POOL: Entry[] = [
  ...ALL_GAMES.map<Entry>(g => {
    const k = TRAINER[g.id] ?? { source: 'game', mode: g.id }
    return { hand: false, goals: GAME_GOALS, make: n => ({ text: `«${g.name}»: ${n} ответов`, to: g.to, goal: n, source: k.source, ...(k.mode ? { mode: k.mode } : {}) }) }
  }),
  { hand: false, goals: GAME_GOALS, make: n => ({ text: `Повтори ${n} слов, в которых были ошибки`, to: '/korean/mistakes', goal: n, source: 'review' }) },
  { hand: false, goals: GAME_GOALS, make: n => ({ text: `Выполни ${n} заданий на странице «Сегодня»`, to: '/korean/today', goal: n, source: 'today' }) },
  { hand: true, goals: [5, 10], make: n => ({ text: `Придумай ${n} своих предложений и запиши в тетрадь`, to: '/korean/words', goal: n }) },
  { hand: true, goals: [20, 50], make: n => ({ text: `Сделай ${n} предложений со словами из словаря`, to: '/korean/words', goal: n }) },
  { hand: true, goals: [5], make: n => ({ text: `Прочитай вслух ${n} строк из справочника`, to: '/korean/ref/reading', goal: n }) },
]

export const CHECK_MIN = 5
/** Больше пунктов, чем есть разных игр и дел, набрать нельзя: каждая игра встречается в списке не больше одного раза (иначе её ответы считались бы дважды). */
export const CHECK_MAX = POOL.length
export const CHECK_DEFAULT = 5
export const clampCheckSize = (n: number) => Math.min(CHECK_MAX, Math.max(CHECK_MIN, Math.round(Number.isFinite(n) ? n : CHECK_DEFAULT)))

/** Число из строки дня: одно и то же в этот день, другое в следующий. */
function seed(day: string): number {
  let h = 2166136261
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
function rng(s: number) {
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Чек-лист на день из `size` пунктов (от 5): почти все с автоподсчётом по одной игре, ручных примерно каждый шестой (не меньше одного).
 * Для одного дня порядок всегда одинаковый: если увеличить `size`, прежние пункты остаются на местах и с теми же целями.
 */
export function checklistFor(day: string, size = CHECK_DEFAULT): CheckItem[] {
  const n = clampCheckSize(size)
  const rand = rng(seed(day))
  const order = POOL.map((p, i) => ({ p, i, k: rand() })).sort((a, b) => a.k - b.k)
  const goals = POOL.map(p => p.goals[Math.floor(rand() * p.goals.length)]!)
  const hands = Math.min(POOL.filter(p => p.hand).length, Math.max(1, Math.floor(n / 6)))
  const pick = (hand: boolean, count: number) => order.filter(o => o.p.hand === hand).slice(0, count)
  const chosen = [...pick(false, n - hands), ...pick(true, hands)]
  // сначала автоматические в порядке жеребьёвки дня, ручные в конце
  return chosen.map(({ p, i }) => ({ id: `${day}-${i}`, ...p.make(goals[i]!) }))
}

/** Сколько ответов с этим источником (и режимом, если он указан) было в этот день по журналу ответов. */
export function answersToday(log: LogEntry[], source: string, day: string, mode?: string): number {
  const from = new Date(day + 'T00:00:00').getTime()
  const to = from + 86400_000
  return log.filter(e => e.s === source && (!mode || e.m === mode) && e.t >= from && e.t < to).length
}

/** Снимок для истории. ticked — id пунктов, отмеченных вручную. */
export function snapshot(items: CheckItem[], log: LogEntry[], day: string, ticked: string[]): CheckSnap[] {
  return items.map(it => {
    const manual = !it.source
    const have = manual ? (ticked.includes(it.id) ? it.goal : 0) : answersToday(log, it.source!, day, it.mode)
    return { text: it.text, to: it.to, goal: it.goal, have: Math.min(have, it.goal), done: have >= it.goal, manual }
  })
}
