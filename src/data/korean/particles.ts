import { CONJUGATIONS, type Conjugation } from './conjugation'
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

/**
 * Правила про формы слова (отрицание 안, 아요/어요, прилагательные): в примерах карточки отмечено одно и то же слово «안»,
 * поэтому «вставь форму» превращается в «выбери 안 каждый раз». Для них задания другие: из таблицы форм
 * берётся слово, и нужно выбрать его правильную форму среди соседних (настоящее, прошедшее, отрицание).
 */
const FORM_RULES: Record<string, { kind?: Conjugation['kind']; title: string; ask: 'neg' | 'present' }> = {
  an: { title: 'Сделай отрицание «не…»', ask: 'neg' },
  ayo: { kind: 'verb', title: 'Скажи вежливо, как сейчас', ask: 'present' },
  adj: { kind: 'adj', title: 'Скажи вежливо, как сейчас', ask: 'present' },
}

function formTasks(id: string, n: number): Task[] {
  const rule = FORM_RULES[id]
  if (!rule) return []
  const out: Task[] = []
  for (const c of shuffle(CONJUGATIONS.filter(x => !rule.kind || x.kind === rule.kind))) {
    if (out.length >= n) break
    const answer = c[rule.ask]
    const wrong = [c.present, c.past, c.neg, `안 ${c.past}`, c.k].filter(o => o !== answer)
    const options = shuffle([answer, ...shuffle([...new Set(wrong)]).slice(0, 3)])
    if (options.length < 3) continue
    const prompt = rule.ask === 'neg' ? `${c.k} («${c.t}») → не…: ＿＿＿` : `${c.k} («${c.t}») → ＿＿＿`
    out.push({ id: out.length, kind: 'rule', title: rule.title, prompt, options, answer, gram: id })
  }
  return out
}

const insertTasks = (id: string, n: number): Task[] => {
  const g = G.find(x => x.id === id)
  const rule = g ? ruleTasks(g, n).filter(t => t.title === INSERT) : []
  if (!FORM_RULES[id]) return rule
  // примеров с «вставь форму» оставляем немного: по ним все варианты на один лад
  return shuffle([...rule.slice(0, 2), ...formTasks(id, n)])
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
