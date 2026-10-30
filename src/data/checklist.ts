import type { LogEntry } from '@/stores/progress'

/** Пункт чек-листа на день. source — откуда считаем ответы сами, без source отметка ручная. */
export interface CheckItem {
  id: string
  text: string
  to: string
  goal: number
  source?: string
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

/** Из одной группы в день берём не больше одного пункта: так ответы одного источника не считаются дважды. */
const POOL: { group: string; make: (n: number) => Omit<CheckItem, 'id'>; goals: number[] }[] = [
  { group: 'game', goals: [10, 15, 20], make: n => ({ text: `Пройди ${n} раз любой режим в игре`, to: '/game', goal: n, source: 'game' }) },
  { group: 'game', goals: [10, 15], make: n => ({ text: `Собери ${n} предложений в игре`, to: '/game?mode=build', goal: n, source: 'game' }) },
  { group: 'game', goals: [10, 15], make: n => ({ text: `Ответь ${n} раз в режиме «Прошедшее время»`, to: '/game?mode=past', goal: n, source: 'game' }) },
  { group: 'trainer', goals: [10, 20], make: n => ({ text: `Ответь ${n} раз в тренажёрах`, to: '/korean/trainers', goal: n, source: 'trainer' }) },
  { group: 'trainer', goals: [10, 15], make: n => ({ text: `Реши ${n} заданий на частицы`, to: '/korean/particles', goal: n, source: 'trainer' }) },
  { group: 'trainer', goals: [10, 15], make: n => ({ text: `Переведи ${n} предложений`, to: '/korean/translate', goal: n, source: 'trainer' }) },
  { group: 'trainer', goals: [10, 15], make: n => ({ text: `Реши ${n} заданий «Похожие, но разные»`, to: '/korean/pairs', goal: n, source: 'trainer' }) },
  { group: 'quick', goals: [5, 10], make: n => ({ text: `Пройди «5 минут»: ${n} ответов`, to: '/korean/quick', goal: n, source: 'quick' }) },
  { group: 'review', goals: [10, 15], make: n => ({ text: `Повтори ${n} слов, в которых были ошибки`, to: '/korean/mistakes', goal: n, source: 'review' }) },
  { group: 'today', goals: [10, 15], make: n => ({ text: `Выполни ${n} заданий на странице «Сегодня»`, to: '/korean/today', goal: n, source: 'today' }) },
  { group: 'hand', goals: [5, 10], make: n => ({ text: `Придумай ${n} своих предложений и запиши в тетрадь`, to: '/korean/words', goal: n }) },
  { group: 'hand', goals: [20, 50], make: n => ({ text: `Сделай ${n} предложений со словами из словаря`, to: '/korean/words', goal: n }) },
  { group: 'hand', goals: [5], make: n => ({ text: `Прочитай вслух ${n} строк из справочника`, to: '/korean/ref/reading', goal: n }) },
]

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

/** Чек-лист на день: 5 пунктов (4 с автоподсчётом и 1 ручной), для одного дня всегда одинаковый. */
export function checklistFor(day: string): CheckItem[] {
  const rand = rng(seed(day))
  const shuffled = POOL.map((p, i) => ({ p, i, k: rand() })).sort((a, b) => a.k - b.k)
  const used = new Set<string>()
  const out: CheckItem[] = []
  for (const { p, i } of shuffled) {
    if (used.has(p.group)) continue
    const want = p.group === 'hand' ? out.filter(o => !o.source).length < 1 : out.filter(o => o.source).length < 4
    if (!want) continue
    used.add(p.group)
    const goal = p.goals[Math.floor(rand() * p.goals.length)]!
    out.push({ id: `${day}-${i}`, ...p.make(goal) })
  }
  // сначала автоматические, ручной в конце
  return out.sort((a, b) => Number(!a.source) - Number(!b.source))
}

/** Сколько ответов с этим источником было в этот день (по журналу ответов). */
export function answersToday(log: LogEntry[], source: string, day: string): number {
  const from = new Date(day + 'T00:00:00').getTime()
  const to = from + 86400_000
  return log.filter(e => e.s === source && e.t >= from && e.t < to).length
}

/** Снимок для истории. ticked — id пунктов, отмеченных вручную. */
export function snapshot(items: CheckItem[], log: LogEntry[], day: string, ticked: string[]): CheckSnap[] {
  return items.map(it => {
    const manual = !it.source
    const have = manual ? (ticked.includes(it.id) ? it.goal : 0) : answersToday(log, it.source!, day)
    return { text: it.text, to: it.to, goal: it.goal, have: Math.min(have, it.goal), done: have >= it.goal, manual }
  })
}
