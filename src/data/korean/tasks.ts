import { D, type Word } from './words'

export type TaskKind = 'tr' | 'back' | 'read' | 'blank'

export interface Task {
  id: number
  kind: TaskKind
  title: string
  prompt: string
  /** подсказка под вопросом (пример или перевод) */
  hint?: string
  options: string[]
  answer: string
}

const shuffle = <T>(a: T[]) => {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Для заданий берём простые слова: одно корейское слово без скобок и пометок. */
const SIMPLE = D.filter(d => /^[가-힣]+$/.test(d.k) && d.t.length <= 40)

/** Короткий перевод для кнопок: без «→ форма» и без скобок. */
const short = (t: string) => t.split(/ →| \(/)[0]!.trim()

export const randomWords = (n: number): Word[] => shuffle(SIMPLE).slice(0, n)

function pick(pool: string[], answer: string, n = 3) {
  const others = shuffle([...new Set(pool)].filter(x => x !== answer)).slice(0, n)
  return shuffle([answer, ...others])
}

const KINDS: Record<TaskKind, string> = {
  tr: 'Что значит слово?',
  back: 'Как это по-корейски?',
  read: 'Как читается?',
  blank: 'Вставь слово в предложение',
}

function make(kind: TaskKind, d: Word, id: number): Task | null {
  if (kind === 'tr') {
    const answer = short(d.t)
    const options = pick(SIMPLE.map(x => short(x.t)), answer)
    return { id, kind, title: KINDS[kind], prompt: d.k, options, answer }
  }
  if (kind === 'back') {
    const options = pick(SIMPLE.map(x => x.k), d.k)
    return { id, kind, title: KINDS[kind], prompt: short(d.t), options, answer: d.k }
  }
  if (kind === 'read') {
    const options = pick(SIMPLE.map(x => x.r), d.r)
    return { id, kind, title: KINDS[kind], prompt: d.k, hint: short(d.t), options, answer: d.r }
  }
  // blank: слово должно встречаться в примере ровно один раз и быть не короче двух слогов
  if (d.k.length < 2 || d.s.split(d.k).length !== 2) return null
  const options = pick(SIMPLE.filter(x => x.k.length >= 2).map(x => x.k), d.k)
  return { id, kind, title: KINDS[kind], prompt: d.s.replace(d.k, '＿＿＿'), hint: short(d.t), options, answer: d.k }
}

/** Набор из n разных заданий на разные слова; типы чередуются. */
export function randomTasks(n = 8): Task[] {
  const kinds: TaskKind[] = ['tr', 'back', 'read', 'blank']
  const tasks: Task[] = []
  const used = new Set<string>()
  for (const d of shuffle(SIMPLE)) {
    if (tasks.length >= n) break
    if (used.has(d.k)) continue
    for (const kind of shuffle(kinds)) {
      const t = make(kind, d, tasks.length)
      if (t) {
        tasks.push(t)
        used.add(d.k)
        break
      }
    }
  }
  return tasks
}
