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
