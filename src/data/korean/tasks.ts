import { ADJECTIVES, VERBS } from './forms'
import { D, type Word } from './words'

export type TaskKind = 'tr' | 'back' | 'read' | 'blank' | 'form' | 'rule'

export interface Task {
  id: number
  kind: TaskKind
  title: string
  prompt: string
  /** подсказка под вопросом (пример или перевод) */
  hint?: string
  options: string[]
  answer: string
  /** слово словаря, к которому относится задание (для прогресса) */
  word?: string
  /** карточка грамматики, на которую задание (для разбора ошибки) */
  gram?: string
  /** корейское предложение задания: после ответа под ним показывается разбор */
  sentence?: string
  /** для каждого варианта: чему он соответствует на другом языке (почему твой вариант не подошёл) */
  pairOf?: Record<string, string>
}

export const shuffle = <T>(a: T[]) => {
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
export const short = (t: string) => t.split(/ →| \(/)[0]!.trim()

/** Слова для заданий: если выбраны темы, берём из них (когда слов хватает), иначе из всех простых. */
const focusPool = (n: number, cats: string[]) => {
  const pool = cats.length ? SIMPLE.filter(d => d.c.some(c => cats.includes(c))) : SIMPLE
  return pool.length >= n ? pool : SIMPLE
}

export const randomWords = (n: number, cats: string[] = []): Word[] => shuffle(focusPool(n, cats)).slice(0, n)

function pick(pool: string[], answer: string, n = 3) {
  const others = shuffle([...new Set(pool)].filter(x => x !== answer)).slice(0, n)
  return shuffle([answer, ...others])
}

const KINDS: Record<Exclude<TaskKind, 'rule'>, string> = {
  tr: 'Что значит слово?',
  back: 'Как это по-корейски?',
  read: 'Как читается?',
  blank: 'Вставь слово в предложение',
  form: '',
}

/** Задание нужного вида на слово (для повторения); null, если для слова вид не подходит. */
export function makeTask(kind: Exclude<TaskKind, 'rule'>, d: Word, id: number): Task | null {
  return make(kind, d, id)
}

type FormWord = (typeof VERBS)[number]

/** formPool — глаголы и прилагательные, подходящие под выбранные темы (задание на форму не привязано к слову d). */
function make(kind: Exclude<TaskKind, 'rule'>, d: Word, id: number, formPool?: FormWord[]): Task | null {
  if (kind === 'tr') {
    const answer = short(d.t)
    const options = pick(SIMPLE.map(x => short(x.t)), answer)
    return { id, kind, title: KINDS[kind], prompt: d.k, options, answer, word: d.k }
  }
  if (kind === 'back') {
    const options = pick(SIMPLE.map(x => x.k), d.k)
    return { id, kind, title: KINDS[kind], prompt: short(d.t), options, answer: d.k, word: d.k }
  }
  if (kind === 'read') {
    const options = pick(SIMPLE.map(x => x.r), d.r)
    return { id, kind, title: KINDS[kind], prompt: d.k, hint: short(d.t), options, answer: d.r, word: d.k }
  }
  if (kind === 'form') {
    const all = [...VERBS, ...ADJECTIVES]
    const candidates = formPool ?? all
    if (!candidates.length) return null
    const e = shuffle(candidates)[0]!
    const past = Math.random() < 0.5
    const answer = (past ? e.past : e.form)!
    const other = (past ? e.form : e.past)!
    const rest = shuffle(all.map(x => (past ? x.past : x.form)!).filter(f => f !== answer && f !== other)).slice(0, 2)
    const options = shuffle([...new Set([answer, other, ...rest])])
    return {
      id,
      kind,
      title: past ? 'Поставь в прошедшее время' : 'Поставь в настоящее время (вежливо)',
      prompt: e.k,
      hint: short(e.t),
      options,
      answer,
      word: e.k,
      ...(!past ? { gram: ADJECTIVES.some(a => a.k === e.k) ? 'adj' : 'ayo' } : {}),
    }
  }
  // blank: слово должно встречаться в примере ровно один раз и быть не короче двух слогов
  if (d.k.length < 2 || d.s.split(d.k).length !== 2) return null
  const options = pick(SIMPLE.filter(x => x.k.length >= 2).map(x => x.k), d.k)
  return { id, kind, title: KINDS[kind], prompt: d.s.replace(d.k, '＿＿＿'), hint: short(d.t), options, answer: d.k, word: d.k }
}

/** Набор из n разных заданий на разные слова; типы чередуются. */
export function randomTasks(n = 8, cats: string[] = []): Task[] {
  const kinds: Exclude<TaskKind, 'rule'>[] = ['tr', 'back', 'read', 'blank', 'form']
  const tasks: Task[] = []
  const used = new Set<string>()
  const focus = focusPool(n, cats)
  const formPool = cats.length ? [...VERBS, ...ADJECTIVES].filter(e => focus.some(d => d.k === e.k)) : undefined
  for (const d of shuffle(focus)) {
    if (tasks.length >= n) break
    if (used.has(d.k)) continue
    for (const kind of shuffle(kinds)) {
      const t = make(kind, d, tasks.length, formPool)
      if (t) {
        tasks.push(t)
        used.add(d.k)
        break
      }
    }
  }
  return tasks
}
