/**
 * «Прогноз TOPIK I» (`/korean/topik`): факты экзамена и расчёт ориентира. Это **моя оценка, а не официальная**: официальных данных «сколько слов даёт сколько баллов» нет.
 * Что измеряется: словарный запас (тест на странице: случайные слова начального уровня «한국어 학습용 어휘 목록»), грамматика (сколько тем книг 1A и 1B пройдено), точность в играх за 30 дней.
 * Чего не измеряется: аудирование (на сайте нет звука); для него показаны два сценария.
 */
export const FORMAT = {
  listening: { questions: 30, minutes: 40 },
  reading: { questions: 40, minutes: 60 },
  /** баллов за блок и всего */
  perPart: 100,
  max: 200,
  level1: 80,
  level2: 140,
} as const

/** Откуда факты (страница показывает ссылки). */
export const SOURCES: { title: string; url: string }[] = [
  { title: 'TOPIK: структура и уровни (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Test_of_Proficiency_in_Korean' },
  { title: 'Баллы и уровни TOPIK (Migii)', url: 'https://migii.net/en/blog/topik-scoring' },
  { title: 'Описание уровней (UAB TOPIK)', url: 'https://webs.uab.cat/topik/niveles/' },
  { title: 'Список словаря TOPIK I (TOPIK Guide)', url: 'https://www.topikguide.com/topik-beginner-level-vocabulary-list-with-meanings/' },
  { title: 'Грамматика TOPIK I (Elon)', url: 'https://elon.io/grammar/korean/paths/topik1-grammar-checklist' },
]

/** В тесте слов к слову дают четыре перевода и ещё «не знаю»: угаданный ответ считается поправкой, чтобы случайные попадания не завышали запас. */
export const CHOICES = 4

/** Доля знакомых слов по тесту: верные минус угаданные (неверные ответы делятся на число вариантов без одного); «не знаю» не штрафуется. */
export function vocabShare(t: { n: number; correct: number; wrong: number }): number {
  if (t.n <= 0) return 0
  return clamp((t.correct - t.wrong / (CHOICES - 1)) / t.n, 0, 1)
}

/** Что измерено: доли от 0 до 1; `null` — данных нет. */
export interface Measures {
  /** доля знакомых слов по последнему тесту словаря */
  vocab: number | null
  /** сколько слов было в тесте (чем больше, тем меньше погрешность) */
  vocabN: number
  /** доля пройденных тем книг 1A и 1B */
  grammar: number
  /** доля верных ответов за 30 дней (если ответов мало, null) */
  accuracy: number | null
}

/** Веса измерений в оценке чтения; если измерения нет, вес делится между остальными. */
export const WEIGHTS = { vocab: 0.5, grammar: 0.35, accuracy: 0.15 }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface Range { lo: number; mid: number; hi: number }

/** Оценка блока «чтение» из измерений: взвешенная доля × 95, разброс от погрешности теста слов и неточности формулы. */
export function readingRange(m: Measures): Range | null {
  const parts: [number, number][] = []
  if (m.vocab !== null) parts.push([m.vocab, WEIGHTS.vocab])
  parts.push([m.grammar, WEIGHTS.grammar])
  if (m.accuracy !== null) parts.push([m.accuracy, WEIGHTS.accuracy])
  if (m.vocab === null) return null
  const wsum = parts.reduce((a, [, w]) => a + w, 0)
  const f = parts.reduce((a, [v, w]) => a + v * w, 0) / wsum
  const mid = clamp(f * 95, 0, 100)
  // доверительный интервал доли по числу слов (90%) + постоянная неточность формулы
  const se = m.vocab !== null && m.vocabN > 0 ? Math.sqrt((m.vocab * (1 - m.vocab)) / m.vocabN) : 0.12
  const margin = 1.64 * se * (WEIGHTS.vocab / wsum) * 95 + 7
  return { lo: clamp(mid - margin, 0, 100), mid, hi: clamp(mid + margin, 0, 100) }
}

/** Сценарии аудирования: звука на сайте нет, поэтому два допущения. */
export const LISTENING = {
  same: { label: 'аудирование как чтение', shift: 0 },
  lower: { label: 'аудирование на 15 баллов ниже', shift: -15 },
} as const
export type ListeningMode = keyof typeof LISTENING

export function totalRange(reading: Range, mode: ListeningMode): Range {
  const s = LISTENING[mode].shift
  const l = (v: number) => clamp(v + s, 0, 100)
  return { lo: Math.round(reading.lo + l(reading.lo)), mid: Math.round(reading.mid + l(reading.mid)), hi: Math.round(reading.hi + l(reading.hi)) }
}

/** Уровень по баллам: 0 — ниже порога 1-го уровня. */
export const levelOf = (score: number): 0 | 1 | 2 => (score >= FORMAT.level2 ? 2 : score >= FORMAT.level1 ? 1 : 0)

/** Погрешность теста слов в процентных пунктах (90%). */
export const vocabMargin = (share: number, n: number) => (n > 0 ? Math.round(1.64 * Math.sqrt((share * (1 - share)) / n) * 100) : 0)

/** Какая доля слов и тем нужна, чтобы середина прогноза дошла до порога (оба измерения растут одинаково, точность считается равной). */
export function neededShare(target: number, mode: ListeningMode): number {
  // total(mid) = r + clamp(r + shift): при shift ≤ 0 ищем r перебором; r = 95·f
  for (let f = 0; f <= 1.0001; f += 0.005) {
    const r = clamp(f * 95, 0, 100)
    if (r + clamp(r + LISTENING[mode].shift, 0, 100) >= target) return Math.round(f * 1000) / 10
  }
  return 100
}
