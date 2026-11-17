/** Чистые функции краткой сводки об обучении (`GET /api/learning`): без базы, чтобы проверять тестами. */

/** День «ГГГГ-ММ-ДД» по местному времени сервера. */
export function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Список пройденных тем из `KNOWN_GRAMMAR` («- тема — пояснение» по строке). */
export const grammarList = (text: string): string[] =>
  text
    .split('\n')
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)

/** Список тем впереди из `KNOWN_NOT_YET` (через «; »). */
export const notYetList = (text: string): string[] =>
  text
    .split(';')
    .map(l => l.trim())
    .filter(Boolean)

/** Серия занятых дней подряд до сегодня; если сегодня ещё не занимались, считается от вчера. */
export function streakOf(activeDays: Iterable<string>, now = Date.now()): number {
  const set = new Set(activeDays)
  let t = now
  if (!set.has(dayKey(t))) t -= 86_400_000
  let n = 0
  while (set.has(dayKey(t))) {
    n++
    t -= 86_400_000
  }
  return n
}

export interface WordRow {
  word: string
  ok: number
  bad: number
  streak: number
  last: number
  kd: number | null
}

/** Слова: сколько выучено (отметка `kd`: пять верных подряд), сколько в работе, недавно выученные и слабые. */
export function wordsSummary(rows: WordRow[], now = Date.now()) {
  const learned = rows.filter(r => r.kd)
  const week = now - 7 * 86_400_000
  return {
    learned: learned.length,
    inProgress: rows.filter(r => !r.kd && r.ok + r.bad > 0).length,
    learnedThisWeek: learned.filter(r => (r.kd ?? 0) >= week).map(r => r.word),
    weak: rows
      .filter(r => !r.kd && r.bad > r.ok)
      .sort((a, b) => b.bad - b.ok - (a.bad - a.ok))
      .slice(0, 10)
      .map(r => ({ word: r.word, ok: r.ok, bad: r.bad })),
  }
}

/** Режимы с точностью ниже 90% при хотя бы 20 ответах: что стоит повторить. */
export const weakModes = (rows: { source: string; mode: string; ok: number; bad: number }[]) =>
  rows
    .filter(r => r.ok + r.bad >= 20 && r.ok / (r.ok + r.bad) < 0.9)
    .map(r => ({ source: r.source, mode: r.mode, answers: r.ok + r.bad, accuracy: Math.round((100 * r.ok) / (r.ok + r.bad)) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8)
