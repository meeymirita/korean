// Типы движка игры «Хлебушек» (`engine.ts`): вопрос, состояние, хуки страницы. Вынесены сюда, чтобы движок проверял компилятор.
import type { Story } from './stories'

/** Что страница игры передаёт движку: общий прогресс сайта и настройки. */
export interface GameHooks {
  record: (o: { word: string | null; ok: boolean; xp?: number; mode?: string; detail?: { q?: string; a?: string; y?: string; g?: string } }) => unknown
  importXp: (n: number) => void
  state: () => { level: number; title: string; max: boolean; into: number; span: number; pct: number; todayOk: number; goal: number }
  /** Группы слов, выбранные в кабинете. */
  cats?: () => Record<string, number> | null | undefined
  /** Режим из адреса страницы (`?game=`). */
  mode?: () => string | undefined
  /** Правило «Текстов по правилу» из адреса (`&fam=`). */
  fam?: () => string | undefined
  saveCats?: (c: Record<string, number>) => void
  /** Открыть окно карточки грамматики. */
  grammar?: (id: string) => void
}

/** Вариант ответа в задании с выбором. */
export interface Option { text: string; ko?: boolean; sub?: string; /** короткое значение варианта, когда в тексте есть ещё подпись */ k?: string }

/** Кусок предложения в тексте: обычный текст, выделенное слово, готовый ответ или пропуск (номер в `gaps`). */
export interface StoryPart { t?: string; mark?: boolean; ans?: boolean; gap?: number }
/** Пропуск текста: что нужно, что ещё принимается, почему; `picked` что поставили, `ok` результат после проверки. */
export interface StoryGap { right: string; accept: string[] | null; why: string; hp: string; picked: string | null; ok: boolean | null; input: boolean }
export interface StorySent { ko: string; ru: string; tip: string; noTr: boolean; cue: string; parts: StoryPart[]; gapIdx: number[] }

/** Кусок предложения, из которых `makeStory` собирает текст: строка или пропуск / выделение / готовый ответ. */
export type Piece = string | { right?: string; accept?: string[]; why?: string; input?: boolean; mark?: string; ans?: string }
export interface SentIn { ko: string; ru: string; pieces: Piece[]; tip?: string; noTr?: boolean; cue?: string }

/**
 * Вопрос игры. Вид задаёт `type`: `choice` (варианты), `type` (ввод), `build` (собери из плиток), `story` (текст с пропусками).
 * Общие поля есть у всех, остальные зависят от вида.
 */
export interface Question {
  type: string
  mode: string
  key: string
  label: string
  /** что показать в истории ответов: вопрос и верный ответ */
  hp: string
  hr: string
  icon: string
  right: string
  explain: (string | undefined)[]
  /** слово словаря, к которому относится вопрос (для прогресса слов) */
  word?: string | null
  prompt?: string
  promptKo?: boolean
  reading?: string
  sub?: string
  ru?: string
  note?: string
  /** предложение для разбора «Как собрано» и его перевод */
  teach?: string
  trans?: string
  level?: number
  /** вопрос вернулся из очереди ошибок */
  retry?: boolean
  xp?: number
  /** id карточки грамматики для «Слабых правил» */
  g?: string
  // choice
  options?: Option[]
  correct?: number
  sentence?: { pre: string; post: string }
  cue?: string
  // type
  answers?: string[]
  squash?: boolean
  placeholder?: string
  hintN?: number
  // build
  tiles?: string[]
  accept?: string[]
  check?: (words: string[]) => boolean
  // story
  sents?: StorySent[]
  gaps?: StoryGap[]
  input?: boolean
  bank?: string[]
  active?: number | null
  checked?: boolean
  bonus?: number
  need?: boolean
  /** build: номера выбранных плиток по порядку; story: номер выбранной плитки банка */
  sel?: number[] | number | null
}
/** Вопрос «Собери предложение». */
export interface BuildQ extends Question { tiles: string[]; accept: string[]; sel: number[] }
/** Вопрос-текст с пропусками. */
export interface StoryQ extends Question { sents: StorySent[]; gaps: StoryGap[]; bank: string[]; input: boolean; active: number | null; sel: number | null; checked: boolean; bonus: number }
/** Вопрос с вариантами. */
export interface ChoiceQ extends Question { options: Option[]; correct: number }

/** Ошибка по вопросу: сколько раз ещё вернуть и подпись для списка «слабых». */
export interface Miss { n: number; l: string }
export interface HistItem { ok: boolean; icon: string; p: string; r: string; you: string | null }
export interface ModeStat { ok: number; bad: number; best: number }

/** Состояние игры; часть полей сохраняется в `localStorage['hleb_game_v1']`. */
export interface GameState {
  mode: string
  fut: string
  level: number | 'any'
  /** уровень текста по режимам: simple / story / long */
  levels: Record<string, string>
  pfam: string
  bstory: { st: Story; i: number; lv: string; shown: boolean } | null
  gloss: boolean
  cats: Record<string, number>
  reading: boolean
  tense: string
  ses: { ok: number; bad: number; streak: number; best: number }
  all: { ok: number; bad: number; best: number; bestBlitz: number; bestSurv: number; bestBlitzBy: Record<string, number>; bestSurvBy: Record<string, number>; xp: number; byMode: Record<string, ModeStat> }
  miss: Record<string, Miss>
  hints: number
  surv: { on: boolean; lives: number; max: number; ok: number }
  lastOver: string
  blitzSecs: number
  survLives: number
  seenHelp: boolean
  modeHelp: Record<string, number>
  hist: HistItem[]
  cur: Question | null
  answered: boolean
  tab: string
  lastKey: string | null
  timer: ReturnType<typeof setTimeout> | undefined
  win: HTMLElement | null
  blitz: { on: boolean; left: number; total: number; ok: number; bad: number; iv: ReturnType<typeof setInterval> | undefined }
  retryQueue: { q: Question; left: number }[]
  retryKeys: Set<string>
}
