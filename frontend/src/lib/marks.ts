/**
 * Метки `settings.marks`: разбор и лимиты (чистая логика, без браузера и стора).
 * Виды: `w` слово из словаря сайта (звёздочка «Важное»), `g` правило, `d`/`u` отметки «урок пройден» у грамматики,
 * `k` слово большого словаря `/dict` (избранное, `k:<слово>`; страница «Важное» берёт `w:` и `g:`, серия по важным словам только `w:`).
 * Лимиты и вид метки продублированы на сервере (`MARK`, `MAX_MARKS`, `MAX_K_MARKS` в `backend/src/progress/progress.service.ts`): менять в обоих, тест `tests/marks.test.mjs` сверяет.
 */
export type MarkKind = 'w' | 'g' | 'd' | 'u' | 'k'

/** Вид метки: буква вида, двоеточие, от 1 до 40 знаков. */
export const MARK_RE = /^[wgduk]:.{1,40}$/
/** Метки видов `w`, `g`, `d`, `u` (прежний лимит 500). */
export const MAX_MARKS = 500
/** Избранное большого словаря `k:` считается отдельно, чтобы оно не вытесняло звёздочки «Важного». */
export const MAX_K_MARKS = 500
/** Всего меток в `settings.marks`. */
export const MAX_MARKS_TOTAL = MAX_MARKS + MAX_K_MARKS
/** Длина слова в метке. */
export const MARK_ID_MAX = 40

export const markKey = (kind: MarkKind, id: string) => `${kind}:${id}`

/** Разбор метки; не метка: `null`. */
export function parseMark(m: unknown): { kind: MarkKind; id: string } | null {
  if (typeof m !== 'string' || !MARK_RE.test(m)) return null
  return { kind: m[0] as MarkKind, id: m.slice(2) }
}

/** Слово можно сохранить меткой `k:`: непустое, без пробелов по краям, не длиннее 40 знаков. */
export const isMarkableWord = (w: unknown): w is string => typeof w === 'string' && w.length > 0 && w.length <= MARK_ID_MAX && w === w.trim()

/** Лимит метки этого вида: `k` считается отдельно от остальных. */
export const markLimit = (kind: MarkKind) => (kind === 'k' ? MAX_K_MARKS : MAX_MARKS)
const isK = (m: string) => m.startsWith('k:')

/** Можно ли добавить ещё одну метку такого вида. */
export const canAddMark = (marks: readonly string[], kind: MarkKind) =>
  marks.filter(m => isK(m) === (kind === 'k')).length < markLimit(kind)

/** Очистка списка меток: только верные, без повторов, в пределах лимитов (лишние в конце отбрасываются). */
export function cleanMarks(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  let k = 0
  let rest = 0
  for (const m of new Set(list)) {
    if (!parseMark(m)) continue
    if (isK(m as string)) { if (k++ < MAX_K_MARKS) out.push(m as string) }
    else if (rest++ < MAX_MARKS) out.push(m as string)
  }
  return out
}

/** Слова большого словаря из меток `k:` в порядке добавления. */
export const kWords = (marks: readonly string[]): string[] => marks.filter(isK).map(m => m.slice(2))
