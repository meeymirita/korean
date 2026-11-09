import { PFAMS, type RuleFamily } from '@/game/families'
import { ptextPool, type PtextMark } from '@/game/ptext-pool'
import { G } from './grammar'
import { shuffle } from './tasks'

/**
 * Итоговая оценка: один большой экзамен по всему пройденному, частями. Критерий тот же, что на сервере (`exams.service.ts`):
 * верных не меньше EXAM_PASS всего и не меньше MIN_RULE по каждому правилу отдельно, чтобы сильные правила не вытягивали слабое.
 */
export const EXAM_PASS = 0.85
export const MIN_RULE = 0.7
/** С какой доли верных по правилу оно считается «своим» (то же на сервере). */
export const OWN_RULE = 0.8
export const RECHECK_DAYS = 30
export const EXAM_PARTS = 3
/** Сколько верных нужно из n пунктов экзамена. */
export const examNeed = (n: number) => Math.ceil(n * EXAM_PASS)
/** id результата итогового экзамена на сервере. */
export const EXAM_ID = 'final'

/** Пары частиц, где верная форма зависит от 받침: подмена на двойника даёт заведомо неверное предложение. */
export const TWIN: Record<string, string> = { 은: '는', 는: '은', 이: '가', 가: '이', 을: '를', 를: '을', 과: '와', 와: '과' }
/** Все плитки блока с плитками: частицы правил экзамена и чужие. */
const BANK = ['은', '는', '이', '가', '을', '를', '에', '에서', '도', '와', '과', '하고', '만']

/** Правила экзамена: семьи частиц (`game/families.ts`), у которых есть хотя бы одна пройденная (ok) карточка. Дальше сюда добавляются связка, формы глаголов и т.д. */
export const examRules = (): RuleFamily[] =>
  PFAMS.filter(f => f.id !== 'all' && f.g.some(id => G.find(g => g.id === id)?.st === 'ok'))
/** Название правила для таблицы результатов. */
export const ruleLabel = (id: string) => PFAMS.find(f => f.id === id)?.name ?? id

/** Частица в разборе принадлежит правилу: по карточке (`g`) и тексту; у 와 / 과 разбор карточки не указывает (как в `inFam` игры). */
const inRule = (f: RuleFamily, m: PtextMark) => f.marks.includes(m.text) && (f.g.includes(m.g) || (f.id === 'and' && (m.text === '와' || m.text === '과')))

/**
 * Какие ещё ответы в пропуске тоже верны. У 은/는 и 이/가 по смыслу предложения не отличить (컵은 / 컵이 책상 위에 있어요), поэтому принимается и пара-двойник
 * с той же 받침 (는 ↔ 가, 은 ↔ 이); у 하고 / 와 / 과 принимаются все три.
 */
const SWAP: Record<string, string> = { 은: '이', 는: '가', 이: '은', 가: '는' }
const ACCEPT = (m: { text: string; rule: string }): string[] | undefined =>
  m.rule === 'and' ? ['하고', '와', '과'].filter(x => x !== m.text) : SWAP[m.text] ? [SWAP[m.text]!] : undefined

/** Часть предложения: просто текст или пропуск с верным ответом и правилом. */
export type ExamPiece = string | { answer: string; accept?: string[]; rule: string }
export interface ExamSentence { ru: string; ko: string; pieces: ExamPiece[] }

export type ExamBlock =
  /** Текст с пропусками: частицы ставятся плитками (typed: false) или вписываются с клавиатуры (typed: true). */
  | { kind: 'gaps'; id: string; title: string; note: string; typed: boolean; bank: string[]; sentences: ExamSentence[] }
  /** К каждому корейскому предложению выбрать его перевод из списка. */
  | { kind: 'match'; id: string; title: string; note: string; items: { ko: string; ru: string; rule: string }[]; choices: string[] }
  /** Собрать предложение из слов в правильном порядке. */
  | { kind: 'order'; id: string; title: string; note: string; items: { ru: string; ko: string; words: string[]; rule: string }[] }
  /** Про каждое предложение сказать, верное оно или с ошибкой. */
  | { kind: 'errors'; id: string; title: string; note: string; items: { ko: string; ru: string; bad: boolean; rule: string }[] }

/** Правила всех пунктов блока (по одному на пропуск, соответствие, предложение). */
export const blockRules = (b: ExamBlock): string[] =>
  b.kind === 'gaps' ? b.sentences.flatMap(s => s.pieces.flatMap(p => (typeof p === 'string' ? [] : [p.rule]))) : b.items.map(x => x.rule)
export const blockPoints = (b: ExamBlock) => blockRules(b).length
export const partPoints = (blocks: ExamBlock[]) => blocks.reduce((n, b) => n + blockPoints(b), 0)
export const examTotal = (parts: ExamBlock[][]) => parts.reduce((n, p) => n + partPoints(p), 0)

/** Ошибка попытки: блок, вопрос, твой ответ, верный ответ (то же, что хранит сервер). */
export interface ExamMistake { b: string; q: string; y: string; a: string }
/** Результат одного пункта: правило и верно ли; ошибка с разбором, если неверно. */
export interface PointResult { rule: string; ok: boolean; m?: ExamMistake }
/** Черновик экзамена на сервере: задания всех частей и результаты сохранённых (null, пока часть не пройдена). */
export interface ExamDraft { v: 1; startedAt: number; parts: ExamBlock[][]; results: (PointResult[] | null)[] }
export type RuleScores = Record<string, { ok: number; total: number }>

/** Свёртка результатов всех частей: верных, всего, по правилам и список ошибок. */
export function summarize(results: PointResult[][]) {
  const rules: RuleScores = {}
  const mistakes: ExamMistake[] = []
  let right = 0
  let total = 0
  for (const part of results) {
    for (const p of part) {
      const r = (rules[p.rule] ??= { ok: 0, total: 0 })
      r.total++
      total++
      if (p.ok) {
        r.ok++
        right++
      } else if (p.m) mistakes.push(p.m)
    }
  }
  return { right, total, rules, mistakes }
}

/** Сдан ли экзамен по итогам (то же правило, что на сервере). */
export const examPassed = (right: number, total: number, rules: RuleScores) =>
  total > 0 && right / total >= EXAM_PASS && Object.values(rules).every(r => r.ok / r.total >= MIN_RULE)

const cut = (ko: string, m: PtextMark, to: string) => ko.slice(0, m.at) + to + ko.slice(m.at + m.text.length)
const bare = (ko: string) => ko.replace(/[.,?!]/g, '')

type RMark = PtextMark & { rule: string }
type Cand = { ko: string; ru: string; marks: RMark[] }

/**
 * Три части экзамена из предложений сайта (общий пул `ptextPool`), без повторов предложений между частями.
 * В каждой части пять блоков (в случайном порядке): текст с пропусками плитками (12 пунктов), ввод частиц с клавиатуры (8), перевод (6),
 * порядок слов (4) и поиск ошибок (8). Пункты поровну раздаются правилам (у каждого пункта своё правило), чтобы по итогам был разбор по правилам.
 * Подсказок нет, перевод дан как контекст. Результаты считаются при сохранении части, показываются в конце.
 */
export function examParts(parts = EXAM_PARTS): ExamBlock[][] {
  const rules = examRules()
  const ruleIds = rules.map(r => r.id)
  const cands: Cand[] = ptextPool()
    .map(x => ({
      ko: x.ko,
      ru: x.ru,
      marks: x.marks.flatMap(m => {
        const f = rules.find(r => inRule(r, m))
        return f ? [{ ...m, rule: f.id }] : []
      }),
    }))
    .filter(c => c.marks.length)
  const pool = shuffle(cands)
  const used = new Set<string>()
  const ruUsed = new Set<string>()
  const count: Record<string, number> = Object.fromEntries(ruleIds.map(id => [id, 0]))

  /** Следующее правило: то, которому пока выдано меньше всего пунктов (при равенстве случайное), из `allowed`. */
  const nextRule = (allowed: string[]) => {
    const min = Math.min(...allowed.map(id => count[id]!))
    return shuffle(allowed.filter(id => count[id] === min))[0]!
  }
  const markOf = (c: Cand, rule: string, pred: (m: RMark) => boolean = () => true) => shuffle(c.marks.filter(m => m.rule === rule && pred(m)))[0]
  /** Неиспользованное предложение, где есть частица этого правила (и подходящая под условие). */
  const pick = (rule: string, pred?: (c: Cand) => boolean, mpred?: (m: RMark) => boolean) => {
    const c = pool.find(x => !used.has(x.ko) && !ruUsed.has(x.ru.toLowerCase()) && !!markOf(x, rule, mpred) && (!pred || pred(x)))
    if (!c) return undefined
    used.add(c.ko)
    ruUsed.add(c.ru.toLowerCase())
    return c
  }
  const piece = (m: RMark): ExamPiece => ({ answer: m.text, accept: ACCEPT(m), rule: m.rule })

  /** Текст из предложений, пока не наберётся `points` пропусков (в предложении до двух пропусков). */
  const gapBlock = (id: string, title: string, note: string, typed: boolean, points: number): ExamBlock => {
    const sentences: ExamSentence[] = []
    let left = points
    while (left > 0) {
      const rule = nextRule(ruleIds)
      const c = pick(rule)
      if (!c) break
      const first = markOf(c, rule)!
      const use = [first]
      if (left >= 2) {
        const other = shuffle(c.marks.filter(m => m !== first && m.at !== first.at))[0]
        if (other) use.push(other)
      }
      use.sort((a, b) => a.at - b.at)
      const pieces: ExamPiece[] = []
      let pos = 0
      for (const m of use) {
        pieces.push(c.ko.slice(pos, m.at), piece(m))
        pos = m.at + m.text.length
        count[m.rule]!++
        left--
      }
      pieces.push(c.ko.slice(pos))
      sentences.push({ ru: c.ru, ko: c.ko, pieces })
    }
    return { kind: 'gaps', id, title, note, typed, bank: typed ? [] : shuffle(BANK), sentences }
  }

  const part = (n: number): ExamBlock[] => {
    const blocks: ExamBlock[] = []
    blocks.push(gapBlock(`tiles${n}`, 'Поставь частицы', 'Нажми на пропуск и на плитку (или сразу на плитку: она встанет в первый свободный пропуск). Чужие плитки лишние.', false, 12))
    blocks.push(gapBlock(`typed${n}`, 'Впиши частицы', 'Здесь плиток нет: впиши каждую частицу с клавиатуры.', true, 8))
    // перевод: 6 предложений
    const mi: { ko: string; ru: string; rule: string }[] = []
    for (let i = 0; i < 6; i++) {
      const rule = nextRule(ruleIds)
      const c = pick(rule)
      if (!c) break
      mi.push({ ko: c.ko, ru: c.ru, rule })
      count[rule]!++
    }
    blocks.push({ kind: 'match', id: `match${n}`, title: 'Переведи', note: 'Выбери для каждого предложения его перевод. Каждый перевод подходит только одному.', items: mi, choices: shuffle(mi.map(x => x.ru)) })
    // порядок слов: 4 предложения из 3–6 слов
    const oi: { ru: string; ko: string; words: string[]; rule: string }[] = []
    for (let i = 0; i < 4; i++) {
      const rule = nextRule(ruleIds)
      const c = pick(rule, x => {
        const w = bare(x.ko).split(/\s+/).length
        return w >= 3 && w <= 6
      })
      if (!c) break
      oi.push({ ru: c.ru, ko: bare(c.ko), words: shuffle(bare(c.ko).split(/\s+/)), rule })
      count[rule]!++
    }
    blocks.push({ kind: 'order', id: `order${n}`, title: 'Расставь слова по порядку', note: 'Нажимай на слова, чтобы собрать предложение; нажми на собранное слово, чтобы убрать его.', items: oi })
    // ошибки: половина предложений испорчена подменой двойника (только у правил с двойниками по 받침)
    const twinnable = ruleIds.filter(id => rules.find(r => r.id === id)!.marks.some(m => TWIN[m]))
    const ei: { ko: string; ru: string; bad: boolean; rule: string }[] = []
    for (let i = 0; i < 4; i++) {
      const rule = nextRule(twinnable)
      const c = pick(rule, undefined, m => !!TWIN[m.text])
      if (!c) break
      const m = markOf(c, rule, x => !!TWIN[x.text])!
      ei.push({ ko: cut(c.ko, m, TWIN[m.text]!), ru: c.ru, bad: true, rule })
      count[rule]!++
    }
    for (let i = 0; i < 4; i++) {
      const rule = nextRule(ruleIds)
      const c = pick(rule)
      if (!c) break
      ei.push({ ko: c.ko, ru: c.ru, bad: false, rule })
      count[rule]!++
    }
    blocks.push({ kind: 'errors', id: `errors${n}`, title: 'Найди ошибки', note: 'Про каждое предложение скажи: оно верное или в нём ошибка в частице.', items: shuffle(ei) })
    return shuffle(blocks)
  }
  return Array.from({ length: parts }, (_, i) => part(i + 1))
}

/** Попытка итогового экзамена на сервере и состояние для списка. */
export interface ExamResultRow { title: string; best: number; last: number; at: number; passed: boolean; rules: RuleScores; retryAt: number; dueAt: number | null; tries: number }
export interface ExamAttempt { at: number; right: number; total: number; passed: boolean; rules: RuleScores; mistakes: ExamMistake[] }
export type ExamState = 'new' | 'passed' | 'failed' | 'due'
export function examState(r: ExamResultRow | undefined, now = Date.now()): ExamState {
  if (!r) return 'new'
  if (!r.passed) return 'failed'
  return r.dueAt !== null && now >= r.dueAt ? 'due' : 'passed'
}
