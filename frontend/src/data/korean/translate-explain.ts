import { G } from './grammar'
import { analyze } from './parse'
import { STUDY_TRANSLATIONS } from './study'
import { shuffle, type Task } from './tasks'
import { pairIndex, sentenceTask } from './translate'

/** Предложение для тренажёра «Переведи и объясни» и пройденные правила, которые в нём работают (по порядку в предложении). */
export interface ExplainCandidate {
  ko: string
  rules: string[]
}

const PASSED = new Set(G.filter(g => g.st === 'ok').map(g => g.id))

/**
 * Правила предложения по разбору `analyze()` (id карточек в `Segment.g`, без повторов).
 * null, если в предложении есть слово не из словаря или правило, которое ещё не пройдено (карточка не `ok`): такое в задание не берём.
 */
export function passedRulesOf(ko: string): string[] | null {
  const segs = analyze(ko)
  if (segs.some(s => s.type === 'unknown')) return null
  const rules = [...new Set(segs.flatMap(s => (s.g ? [s.g] : [])))]
  return rules.every(r => PASSED.has(r)) ? rules : null
}

let cached: ExplainCandidate[] | undefined
/** Все подходящие предложения из `STUDY_TRANSLATIONS`: целиком по пройденному, хотя бы одно правило в разборе. Считается один раз. */
export function explainCandidates(): ExplainCandidate[] {
  cached ??= Object.keys(STUDY_TRANSLATIONS).flatMap(ko => {
    const rules = passedRulesOf(ko)
    return rules?.length ? [{ ko, rules }] : []
  })
  return cached
}

/**
 * Выбор предложений для серии: правила идут по кругу в случайном порядке, на каждое правило берётся случайное предложение с ним,
 * поэтому в серии встречаются разные правила, а не только самое частое (아요 есть почти в каждом предложении). Предложения не повторяются.
 */
export function pickExplainSet<T extends ExplainCandidate>(cands: T[], n: number): T[] {
  const left = new Set(cands.filter(c => c.rules.length))
  const out: T[] = []
  let cycle: string[] = []
  while (out.length < n && left.size) {
    if (!cycle.length) cycle = shuffle([...new Set([...left].flatMap(c => c.rules))])
    const rule = cycle.shift()!
    const pool = [...left].filter(c => c.rules.includes(rule))
    if (!pool.length) continue
    const c = shuffle(pool)[0]!
    left.delete(c)
    out.push(c)
    cycle = cycle.filter(r => !c.rules.includes(r))
  }
  return shuffle(out)
}

/** Серия «Переведи и объясни»: перевод корейского предложения на русский (4 варианта), после ответа разбор по словам и ссылки на карточки правил. Номера заданий подряд. */
export function explainTasks(n = 15): Task[] {
  const out: Task[] = []
  for (const c of pickExplainSet(explainCandidates(), n + 5)) {
    if (out.length >= n) break
    const idx = pairIndex(c.ko)
    const task = idx < 0 ? null : sentenceTask(idx, true, out.length)
    if (task) out.push({ ...task, title: 'Переведи и объясни', rules: c.rules })
  }
  return out
}
