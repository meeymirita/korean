import { G, type Gram } from './grammar'
import { shuffle, short, type Task } from './tasks'

/** В карточках грамматики часть примера отмечена как {o|이에요}, {b|예요} или {r|안}: это и есть то, что правило меняет. */
const MARK = /\{[a-z]\|([^}]*)\}/g
const plain = (s: string) => s.replace(MARK, '$1')

type Pair = [string, string]
const examplesOf = (g: Gram): Pair[] =>
  g.b.filter(b => b[0] === 'ex').flatMap(b => b[1] as Pair[])

/** Номера заданий на правило начинаются с 1000, чтобы не пересекаться с остальными заданиями страницы. */
export const RULE_TASK_BASE = 1000

/**
 * Задания на правило дня из примеров его карточки.
 * Пример с одной отмеченной частью даёт «вставь нужную форму» (варианты: части из этого и других правил),
 * пример без отметки даёт «что значит предложение» (варианты: переводы других примеров).
 */
export function ruleTasks(g: Gram, n = 3): Task[] {
  const own = examplesOf(g)
  const otherGrams = G.filter(x => x.id !== g.id && x.st === 'ok')
  const otherPairs = otherGrams.flatMap(examplesOf)
  const parts = (pairs: Pair[]) => pairs.flatMap(([ko]) => [...ko.matchAll(MARK)].map(m => m[1]!))

  const tasks: Task[] = []
  for (const [ko, ru] of shuffle(own)) {
    if (tasks.length >= n) break
    const marks = [...ko.matchAll(MARK)]
    const id = RULE_TASK_BASE + tasks.length
    if (marks.length === 1) {
      const answer = marks[0]![1]!
      const wrong = shuffle([...new Set([...parts(own), ...parts(otherPairs)])].filter(p => p !== answer && p.length <= 8))
      // сначала части этого же правила: они сложнее всего, потом чужие
      const own1 = wrong.filter(p => parts(own).includes(p)).slice(0, 2)
      const rest = wrong.filter(p => !own1.includes(p)).slice(0, 3 - own1.length)
      const options = shuffle([answer, ...own1, ...rest])
      if (options.length < 3) continue
      const prompt = plain(ko.replace(marks[0]![0], '＿＿＿'))
      tasks.push({ id, kind: 'rule', title: 'Вставь нужную форму', prompt, hint: short(ru), options, answer, gram: g.id })
    } else {
      const answer = ru
      const wrong = shuffle([...new Set([...own, ...otherPairs].map(p => p[1]))].filter(t => t !== answer)).slice(0, 3)
      if (wrong.length < 2) continue
      tasks.push({ id, kind: 'rule', title: 'Что значит предложение?', prompt: plain(ko), options: shuffle([answer, ...wrong]), answer, gram: g.id })
    }
  }
  return tasks
}

/** Все части, которые правило меняет в примерах (выделены {o|…}, {b|…}, {k|…}). */
const partsOf = (pairs: Pair[]) => pairs.flatMap(([ko]) => [...ko.matchAll(MARK)].map(m => m[1]!))

/** Из карточки можно сделать серию заданий, если в ней хотя бы три примера. */
export const trainableRule = (g: Gram) => examplesOf(g).length >= 3

/**
 * Серия «Потренировать это правило»: до `n` заданий из примеров одной карточки четырёх видов:
 * вставь нужную форму, выбери верное предложение (неверные получаются подменой выделенной части), что значит предложение, как это по-корейски.
 * Работает для любой карточки с примерами, в том числе для новых.
 */
export function ruleSession(g: Gram, n = 10): Task[] {
  const own = examplesOf(g)
  const others = G.filter(x => x.id !== g.id).flatMap(examplesOf)
  const ownParts = [...new Set(partsOf(own))]
  const otherParts = [...new Set(partsOf(others))].filter(p => !ownParts.includes(p))
  const ownPlain = new Set(own.map(([ko]) => plain(ko)))
  const base = (title: string, prompt: string, options: string[], answer: string, extra: Partial<Task> = {}): Omit<Task, 'id'> => ({ kind: 'rule', title, prompt, options, answer, gram: g.id, ...extra })

  const fill: Omit<Task, 'id'>[] = []
  const right: Omit<Task, 'id'>[] = []
  const meaning: Omit<Task, 'id'>[] = []
  const reverse: Omit<Task, 'id'>[] = []
  for (const [ko, ru] of own) {
    const marks = [...ko.matchAll(MARK)]
    const sentence = plain(ko)
    if (marks.length === 1) {
      const answer = marks[0]![1]!
      const swap = (p: string) => ko.replace(marks[0]![0], p)
      // подмены: сначала части этого же правила (самые коварные), потом чужие
      const cand = shuffle([...ownParts.filter(p => p !== answer), ...shuffle(otherParts)].filter(p => p.length <= 8))
      const wrong = shuffle([...new Set(cand)])
      const opts = shuffle([answer, ...wrong.slice(0, 3)])
      if (opts.length >= 3) fill.push(base('Вставь нужную форму', plain(ko.replace(marks[0]![0], '＿＿＿')), opts, answer, { hint: short(ru), sentence }))
      const bad = [...new Set(wrong.map(p => plain(swap(p))).filter(t => t !== sentence && !ownPlain.has(t)))].slice(0, 3)
      if (bad.length >= 2) right.push(base('Какое предложение верное?', ru, shuffle([sentence, ...bad]), sentence, { sentence }))
    }
    const wrongRu = shuffle([...new Set([...own, ...others].map(p => p[1]))].filter(t => t !== ru)).slice(0, 3)
    if (wrongRu.length >= 2) meaning.push(base('Что значит предложение?', sentence, shuffle([ru, ...wrongRu]), ru, { sentence }))
    const wrongKo = shuffle([...new Set([...own, ...others].map(p => plain(p[0])))].filter(t => t !== sentence)).slice(0, 3)
    if (wrongKo.length >= 2) reverse.push(base('Как это по-корейски?', ru, shuffle([sentence, ...wrongKo]), sentence, { sentence }))
  }
  // по кругу из четырёх видов, чтобы серия была разной; повторов предложений нет
  const lists = [fill, right, meaning, reverse].map(l => shuffle(l))
  const out: Task[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < n && lists.some(l => l.length); i++) {
    const t = lists[i % lists.length]!.shift()
    if (!t) continue
    const key = t.title + '|' + t.prompt
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...t, id: RULE_TASK_BASE + out.length })
  }
  return out
}
