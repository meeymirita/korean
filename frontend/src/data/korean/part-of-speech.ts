import { ADJECTIVES, QWORDS, VERBS } from './forms'
import { STUDY, STUDY_TRANSLATIONS } from './study'
import { shuffle, short, type Task } from './tasks'

/** Часть речи в тренажёре «Определи часть речи». Существительных и наречий здесь нет: надёжной разметки у слов словаря нет (`docs/trainers/speech.md`). */
export type Pos = 'verb' | 'adj' | 'qw'

export const POS_LABEL: Record<Pos, string> = { verb: 'Глагол', adj: 'Прилагательное', qw: 'Вопросительное слово' }
/** Варианты ответа: всегда все три, в одном порядке. */
export const POS_OPTIONS: string[] = [POS_LABEL.verb, POS_LABEL.adj, POS_LABEL.qw]

/** Слово заданий с известной частью речи; `form` это вежливое настоящее (у вопросительных слов нет). */
export interface PosWord {
  k: string
  t: string
  pos: Pos
  form?: string
  /** пример из словаря, только если он есть в `STUDY_TRANSLATIONS` */
  sentence?: string
}

/**
 * «Быть, находиться» / «не быть»: у `있다` и `없다` часть речи зависит от значения (бывает и глагол, и описание состояния), разметки нет:
 * в задания не берём, чтобы не угадывать.
 */
const AMBIGUOUS: ReadonlySet<string> = new Set(['있다', '없다'])

let cached: PosWord[] | undefined
/**
 * Слова из `STUDY` (не `EXTRA`), часть речи которых известна по готовым наборам: глаголы и прилагательные из `VERBS` / `ADJECTIVES`
 * (они же в `conjugation.ts`) и вопросительные слова из `QWORDS`. Остальные слова словаря не размечены и сюда не попадают. Считается один раз.
 */
export function posWords(): PosWord[] {
  if (cached) return cached
  const study = new Map(STUDY.map(d => [d.k, d]))
  const out: PosWord[] = []
  const add = (list: { k: string; form?: string }[], pos: Pos) => {
    for (const e of list) {
      const d = study.get(e.k)
      if (!d || AMBIGUOUS.has(e.k)) continue
      out.push({ k: e.k, t: short(d.t), pos, ...(e.form ? { form: e.form } : {}), ...(d.s && STUDY_TRANSLATIONS[d.s] ? { sentence: d.s } : {}) })
    }
  }
  add(VERBS, 'verb')
  add(ADJECTIVES, 'adj')
  add(QWORDS, 'qw')
  cached = out
  return out
}

/** Объяснение «почему»: опирается только на данные слова. */
export function posWhy(w: PosWord): string {
  if (w.pos === 'verb') return `«${w.k}» это глагол: называет действие («${w.t}»). Вежливая форма: ${w.form}.`
  if (w.pos === 'adj') return `«${w.k}» это прилагательное: называет признак («${w.t}»). Меняется как глагол, вежливая форма: ${w.form}.`
  return `«${w.k}» это вопросительное слово: им спрашивают («${w.t}»), а не называют предмет или действие.`
}

/**
 * Выбор слов для серии: поровну по частям речи (вопросительных слов всего семь), недостающее добирается из остальных; слова не повторяются.
 */
export function pickPosSet(words: PosWord[], n: number): PosWord[] {
  const groups = (['verb', 'adj', 'qw'] as Pos[]).map(p => shuffle(words.filter(w => w.pos === p))).filter(g => g.length)
  const out: PosWord[] = []
  for (let i = 0; out.length < n && groups.some(g => i < g.length); i++) {
    for (const g of groups) if (g[i] && out.length < n) out.push(g[i]!)
  }
  return shuffle(out)
}

/** Серия «Определи часть речи»: слово и три варианта; после ответа «почему» и пример слова в предложении. Номера заданий подряд. */
export function posTasks(n = 15): Task[] {
  return pickPosSet(posWords(), n).map((w, id) => ({
    id,
    kind: 'tr',
    title: 'Какая это часть речи?',
    prompt: w.k,
    hint: w.t,
    options: POS_OPTIONS,
    answer: POS_LABEL[w.pos],
    note: posWhy(w),
    ...(w.sentence ? { sentence: w.sentence } : {}),
  }))
}
