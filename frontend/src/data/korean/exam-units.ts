/**
 * «Экзамен единицы» (вкладка «Единицы» на странице «Экзамены», 2026-11-20): короткая проверка (20 вопросов) по темам одной единицы книги
 * «서울대 한국어+ 문법 설명» 1A или 1B (единица = цифра в `bk` карточки: `6-2 ③` — единица 6 книги 1A, `1B 9-1 ②` — единица 9 книги 1B).
 * Только пройденные темы (`st: 'ok'`, у которых есть примеры для заданий). Единица открыта, когда пройдено `min(3, тем в единице)` тем;
 * не хватает вопросов — добираем из соседних единиц, но тоже только из пройденного. Сдан при 80% верных.
 */
import { G, type Gram } from './grammar'
import { mixedSession, ruleSession, trainableRule } from './rule-tasks'
import type { Q } from './topik-mock'

export const UNIT_QUESTIONS = 20
export const UNIT_PASS = 0.8
/** Сколько пройденных тем нужно, чтобы единица открылась (если в единице меньше тем, то все). */
export const UNIT_OPEN_TOPICS = 3

export interface Unit {
  /** `1A-6` */
  id: string
  book: '1A' | '1B'
  n: number
  /** все темы единицы по порядку книги */
  cards: Gram[]
  passed: Gram[]
  /** открыта ли проверка */
  open: boolean
}

const key = (g: Gram) => {
  const m = /(\d+)-(\d+) ([①②③④])/.exec(g.bk ?? '')
  return m ? Number(m[2]) * 10 + '①②③④'.indexOf(m[3]!) : 0
}

/** Единицы обеих книг (1A: 1–8, 1B: 9–16) из карточек с `bk`. */
export function units(cards: readonly Gram[] = G): Unit[] {
  const by = new Map<string, Gram[]>()
  for (const g of cards) {
    const m = /^(1B )?(\d+)-/.exec(g.bk ?? '')
    if (!m) continue
    const id = `${m[1] ? '1B' : '1A'}-${m[2]}`
    by.set(id, [...(by.get(id) ?? []), g])
  }
  return [...by.entries()]
    .map(([id, list]) => {
      const [book, n] = id.split('-') as ['1A' | '1B', string]
      const sorted = list.sort((a, b) => key(a) - key(b))
      const passed = sorted.filter(g => g.st === 'ok')
      return { id, book, n: Number(n), cards: sorted, passed, open: passed.length >= Math.min(UNIT_OPEN_TOPICS, sorted.length) && passed.some(trainableRule) }
    })
    .sort((a, b) => (a.book === b.book ? a.n - b.n : a.book === '1A' ? -1 : 1))
}

const shuffle = <T>(a: readonly T[], rng: () => number): T[] => {
  const x = a.slice()
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[x[i], x[j]] = [x[j]!, x[i]!]
  }
  return x
}

/** Вопросы экзамена единицы: по 5 на пройденную тему этой единицы, до 20; не хватает — из ближайших единиц. */
export function buildUnitExam(unit: Unit, all: readonly Unit[] = units(), rng: () => number = Math.random): Q[] {
  const own = unit.passed.filter(trainableRule)
  const tasks = own.flatMap(g => ruleSession(g, 5))
  if (tasks.length < UNIT_QUESTIONS) {
    const near = all
      .filter(u => u.id !== unit.id)
      .sort((a, b) => Math.abs(a.n - unit.n) - Math.abs(b.n - unit.n))
      .flatMap(u => u.passed.filter(trainableRule))
    const used = new Set(own.map(g => g.id))
    const extra = near.filter(g => !used.has(g.id)).slice(0, 6)
    if (extra.length) tasks.push(...mixedSession(extra, UNIT_QUESTIONS - tasks.length))
  }
  return shuffle(tasks, rng)
    .slice(0, UNIT_QUESTIONS)
    .map((t, i) => ({ id: `u:${unit.id}:${t.id}:${i}`, kind: 'grammar' as const, title: t.title, prompt: t.prompt, hint: t.hint, options: t.options, answer: t.answer }))
    .filter(q => q.options.includes(q.answer))
}
