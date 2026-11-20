/**
 * Вопросы для «Прогноза TOPIK I»: тест слов (слово → выбери перевод) и пробник в стиле TOPIK I «чтение» из того, что есть на сайте:
 * слова (12), грамматика пройденных карточек (12, как «Потренировать правило»), короткие тексты (6, как «Чтение»). Настоящих заданий TOPIK здесь нет:
 * они защищены правом; пробник считает только то, что владелец уже проходил, поэтому тем, которых ещё не было, в нём нет (решение: «не забегать вперёд»).
 */
import { G } from './grammar'
import { readTasks } from './read'
import { mixedSession, trainableRule } from './rule-tasks'
import { CHOICES } from './topik'
import type { Task } from './tasks'

export interface Q {
  id: string
  kind: 'vocab' | 'grammar' | 'reading'
  title: string
  prompt: string
  hint?: string
  options: string[]
  answer: string
}
type Entry = [number, string, string, string]

const shuffle = <T>(a: readonly T[], rng: () => number): T[] => {
  const x = a.slice()
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[x[i], x[j]] = [x[j]!, x[i]!]
  }
  return x
}

/** Слово → четыре перевода (три неверных той же части речи, все разные). */
export function vocabQuestions(pool: readonly Entry[], n: number, rng: () => number = Math.random): Q[] {
  const picked = shuffle(pool, rng).slice(0, n)
  return picked.map(w => {
    const same = shuffle(pool.filter(x => x[2] === w[2] && x[3] !== w[3] && x[1] !== w[1]), rng)
    const wrong: string[] = []
    for (const x of same) if (!wrong.includes(x[3]) && wrong.length < CHOICES - 1) wrong.push(x[3])
    // части речи не хватило (редкая): добираем из всего списка
    for (const x of shuffle(pool, rng)) if (wrong.length < CHOICES - 1 && x[3] !== w[3] && !wrong.includes(x[3])) wrong.push(x[3])
    return { id: 'v:' + w[1], kind: 'vocab' as const, title: 'Слово', prompt: w[1], options: shuffle([w[3], ...wrong], rng), answer: w[3] }
  })
}

const fromTask = (t: Task, kind: Q['kind'], i: number): Q => ({ id: `${kind}:${t.id}:${i}`, kind, title: t.title, prompt: t.prompt, hint: t.hint, options: t.options.slice(0, CHOICES + 1), answer: t.answer })

/** Пробник «чтение»: 12 слов, 12 вопросов по пройденной грамматике, 6 коротких текстов; по порядку видов. */
export function buildMock(pool: readonly Entry[], rng: () => number = Math.random): Q[] {
  const vocab = vocabQuestions(pool, 12, rng)
  const cards = G.filter(g => g.st === 'ok' && trainableRule(g))
  const grammar = mixedSession(cards, 12).map((t, i) => fromTask(t, 'grammar', i)).filter(q => q.options.includes(q.answer))
  const reading = readTasks(6).map((t, i) => fromTask(t, 'reading', i)).filter(q => q.options.includes(q.answer))
  return [...vocab, ...grammar, ...reading]
}
