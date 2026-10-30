import { G } from './grammar'
import { ruleTasks } from './rule-tasks'
import { shuffle, type Task } from './tasks'

export interface ParticleSet {
  id: string
  ko: string
  ru: string
  /** сколько заданий «вставь форму» можно собрать из примеров карточки */
  count: number
}

const INSERT = 'Вставь нужную форму'
const insertTasks = (id: string, n: number): Task[] => {
  const g = G.find(x => x.id === id)
  return g ? ruleTasks(g, n).filter(t => t.title === INSERT) : []
}

/** Правила, из примеров которых выходит хотя бы три задания «вставь форму» (частицы, окончания, связки). Только пройденные карточки. */
export function particleSets(): ParticleSet[] {
  return G.filter(g => g.st === 'ok')
    .map(g => ({ id: g.id, ko: g.ko, ru: g.ru, count: insertTasks(g.id, 30).length }))
    .filter(s => s.count >= 3)
}

/** Набор заданий: по одному правилу (все его примеры, но не больше n) или вперемешку по всем правилам (id пустой). Номера подряд. */
export function particleTasks(id: string, n = 10): Task[] {
  const tasks = id
    ? shuffle(insertTasks(id, 30)).slice(0, n)
    : shuffle(particleSets().flatMap(s => insertTasks(s.id, 3))).slice(0, n)
  return tasks.map((t, i) => ({ ...t, id: i }))
}
