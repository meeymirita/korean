/**
 * Вопросы для «Прогноза TOPIK I»: тест слов (слово → выбери перевод) и пробник в стиле TOPIK I «чтение» на движке большого экзамена. Настоящих заданий TOPIK здесь нет:
 * они защищены правом; всё берётся из пройденного (решение: «не забегать вперёд»).
 */
import { blitzBlocks, examParts, type ExamBlock } from './exam'
import { CHOICES } from './topik'

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
    // неверные варианты: той же части речи и близкой частоты (слова, которые тоже знакомы), иначе вылезают редкие «тётка» и «трапеза»; не хватает таких: берём любые
    const near = pool.filter(x => x[2] === w[2] && x[3] !== w[3] && x[1] !== w[1] && Math.abs(x[0] - w[0]) <= 1500)
    const same = shuffle(near.length >= CHOICES * 2 ? near : pool.filter(x => x[2] === w[2] && x[3] !== w[3] && x[1] !== w[1]), rng)
    const wrong: string[] = []
    for (const x of same) if (!wrong.includes(x[3]) && wrong.length < CHOICES - 1) wrong.push(x[3])
    // части речи не хватило (редкая): добираем из всего списка
    for (const x of shuffle(pool, rng)) if (wrong.length < CHOICES - 1 && x[3] !== w[3] && !wrong.includes(x[3])) wrong.push(x[3])
    return { id: 'v:' + w[1], kind: 'vocab' as const, title: 'Слово', prompt: w[1], options: shuffle([w[3], ...wrong], rng), answer: w[3] }
  })
}

/** Сколько пунктов в пробнике: столько же, сколько вопросов в блоке «чтение» TOPIK I. */
export const MOCK_POINTS = 40

/**
 * Пробник «чтение»: блоки того же движка, что у большого экзамена (`data/korean/exam.ts`): текст с пропусками плитками, ввод частиц, перевод, порядок слов,
 * поиск ошибок, формы глаголов, указатели, вопросительные и счётные слова, числа. Всё берётся из пройденного: когда пройдена новая тема, она сама попадает в
 * генераторы экзамена, и пробник её подхватывает без правок. Около 40 пунктов, виды вперемешку.
 */
export function mockBlocks(points = MOCK_POINTS): ExamBlock[] {
  return blitzBlocks(examParts(4), points)
}
