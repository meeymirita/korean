// Бот-игрок, уровень A (docs/bot.md): общие помощники. Настоящие генераторы заданий запускаются без экрана с зерном, дальше проверяются инварианты.
// Здесь только «как собрать состояние», «как проверить одно задание» и «как измерить разнообразие»; сами прогоны в bot-gen*.spec.ts.
import { createGenerators } from '@/game/generators'
import { MODES } from '@/game/modes'
import type { ChoiceQ, GameHooks, GameState, Question, StoryQ, BuildQ } from '@/game/types'
import { checkSentence } from '../../backend/src/public/rules'
import { STUDY, STUDY_TRANSLATIONS } from '@/data/korean/study'

/** Зерно прогона: `BOT_SEED=123 npx vitest run ...` повторяет тот же прогон. По умолчанию фиксированное, чтобы CI не «мигал». */
export const SEED = Number(process.env.BOT_SEED ?? 20261120)
/** Сколько заданий на режим и уровень (боевой прогон `BOT_N=2000`). */
export const N = Number(process.env.BOT_N ?? 120)

/** Маленький генератор случайных чисел (mulberry32): подменяет `Math.random`, чтобы любой сбой воспроизводился по зерну. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Состояние игры как в `initGame` (engine.ts): только то, что читают генераторы. */
export function makeState(mode: string, level = 'simple'): GameState {
  const levels: Record<string, string> = {}
  for (const m of MODES) levels[m.id] = 'simple'
  levels[mode] = level
  return {
    mode, fut: 'on', level: 'any', levels, pfam: 'topic', bstory: null, gloss: false,
    cats: { v: 1, a: 1, q: 1, p: 1, d: 1, n: 1, l: 1, s: 0, w: 1 }, reading: true, tense: 'both',
    ses: { ok: 0, bad: 0, streak: 0, best: 0 },
    all: { ok: 0, bad: 0, best: 0, bestBlitz: 0, bestSurv: 0, bestBlitzBy: {}, bestSurvBy: {}, xp: 0, byMode: {} },
    miss: {}, hints: 3, surv: { on: false, lives: 3, max: 3, ok: 0 }, lastOver: 'blitz', blitzSecs: 60, survLives: 3,
    seenHelp: false, modeHelp: {}, hist: [], cur: null, answered: false, tab: 'hist', lastKey: null, timer: undefined, win: null,
    blitz: { on: false, left: 60, total: 60, ok: 0, bad: 0, iv: undefined }, retryQueue: [], retryKeys: new Set(),
  }
}
export const stubHooks: GameHooks = {
  record: () => ({}), importXp: () => {},
  state: () => ({ level: 1, title: 'Искра', max: false, into: 0, span: 100, pct: 0, todayOk: 0, goal: 20 }),
}

/** Режимы и их уровни прямо из кода: `MODES`, `STORY_MODES`, `LEVEL_LABELS`. Новый режим или чип попадает сюда сам. */
export function modeLevels() {
  const probe = createGenerators(makeState('word'), stubHooks)
  return MODES.map(m => ({
    id: m.id,
    name: m.name,
    levels: probe.STORY_MODES.includes(m.id)
      ? (probe.LEVEL_LABELS[m.id] ?? [['simple', 'Простой'], ['story', 'Рассказ 2–4'], ['long', 'Длинный 5–10']]).map(([id, label]) => ({ id, label }))
      : [{ id: 'simple', label: 'Простой' }],
  }))
}

export interface Gen { q: Question; mode: string; level: string; i: number }
/** Делает `n` заданий режима на уровне; как в игре, после каждого запоминает `lastKey` (чтобы подряд одно и то же не шло). */
export function generate(mode: string, level: string, n: number, seed: number, tweak?: (S: GameState) => void): Gen[] {
  const S = makeState(mode, level)
  tweak?.(S)
  const g = createGenerators(S, stubHooks)
  const orig = Math.random
  Math.random = seeded(seed)
  try {
    const out: Gen[] = []
    for (let i = 0; i < n; i++) {
      const q = g.genQuestion()
      S.lastKey = q.key
      out.push({ q, mode, level, i })
    }
    return out
  } finally {
    Math.random = orig
  }
}

/** Диапазоны предложений в тексте по уровням (имена чипов; заголовок режима `LEVEL_LABELS`). */
export const SENT_RANGE: Record<string, [number, number]> = { story: [2, 4], long: [5, 10], expert: [8, 12] }
/** Режимы, где число предложений в тексте другое (см. LEVEL_LABELS и docs/trainers). */
export const SENT_RANGE_OF: Record<string, Record<string, [number, number]>> = { spot: { story: [2, 3], long: [4, 5] } }

const BAD_TEXT = /undefined|\bNaN\b|\[object Object\]|\bnull\b/
const CJK = /[぀-ヿ㐀-䶿一-鿿]/
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
/** Все строки задания (без ключей и функций): по ним ищутся мусор и запрещённые знаки. */
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x)
  else if (Array.isArray(x)) x.forEach(y => strings(y, out))
  else if (x && typeof x === 'object' && !(x instanceof Set)) Object.values(x).forEach(y => strings(y, out))
  return out
}
/** Известные «двойники»: если в вариантах стоят оба члена пары, верными могут оказаться оба (docs/data.md, «Проверка нейросетями»). */
const TWINS: [string, string][] = [['은', '이'], ['은', '가'], ['는', '이'], ['는', '가'], ['뭐', '무엇']]

const hasFinal = (ch: string) => ch >= '\uac00' && ch <= '\ud7a3' && (ch.charCodeAt(0) - 0xac00) % 28 > 0
const isHangul = (ch: string) => ch >= '\uac00' && ch <= '\ud7a3'
/** Частицы парами по 받침: после согласной первая, после гласной вторая. */
const BATCHIM_PAIRS: Record<string, boolean> = { 을: true, 이: true, 은: true, 를: false, 가: false, 는: false }
/** Верная частица не по 받침 стоит перед пропуском: `before` последний знак перед ней. */
function batchimWrong(right: string, before: string | undefined): boolean {
  if (before === undefined || !isHangul(before) || !(right in BATCHIM_PAIRS)) return false
  return hasFinal(before) !== BATCHIM_PAIRS[right]
}

/** Корейские предложения и русские переводы, которые задание показывает (для сверки с правилами «не пройдено»). */
export function sentencesOf(q: Question): { ko: string[]; ru: string[] } {
  const ko: string[] = []
  const ru: string[] = []
  if (q.teach) ko.push(q.teach)
  if (q.trans) ru.push(q.trans)
  if (q.sentence) ko.push(q.sentence.pre + (q.right ?? '') + q.sentence.post)
  if (q.ru) ru.push(q.ru)
  if (q.type === 'story') {
    for (const s of (q as StoryQ).sents) {
      ko.push(s.ko)
      if (!s.noTr && s.ru) ru.push(s.ru)
    }
  }
  if (q.type === 'build') ko.push((q as BuildQ).accept[0] ?? '')
  return { ko: ko.filter(Boolean), ru: ru.filter(Boolean) }
}

/** Все нарушения одного задания: список строк «код: подробность» (пустой список = задание в порядке). */
export function violations(g: Gen): string[] {
  const { q } = g
  const v: string[] = []
  const bad = (code: string, more = '') => v.push(more ? `${code}: ${more}` : code)
  const all = strings(q)
  const junk = all.find(x => BAD_TEXT.test(x))
  if (junk) bad('мусор-в-тексте', junk)
  const cjk = all.find(x => CJK.test(x))
  if (cjk) bad('японские-китайские-знаки', cjk)
  const dbl = all.find(x => /\S {2,}\S/.test(x) && !/ {2,}(→|⇒)| {3}/.test(x) && !/[→]/.test(x))
  if (dbl) bad('двойной-пробел', dbl)
  if (!q.label?.trim()) bad('нет-подписи')
  if (!q.icon) bad('нет-значка')

  if (q.type === 'choice') {
    const c = q as ChoiceQ
    const t = c.options.map(o => o.text)
    if (t.length < 2) bad('меньше-двух-вариантов', String(t.length))
    if (t.length > 6) bad('слишком-много-вариантов', String(t.length))
    if (t.some(x => !String(x ?? '').trim())) bad('пустой-вариант')
    if (new Set(t.map(norm)).size !== t.length) bad('повторяются-варианты', t.join(' | '))
    if (!Number.isInteger(c.correct) || c.correct < 0 || c.correct >= t.length) bad('верный-вне-вариантов', String(c.correct))
    else if (q.mode !== 'err' && c.right && norm(t[c.correct]!) !== norm(c.right) && norm(c.options[c.correct]!.k ?? '') !== norm(c.right)) bad('right-не-совпал-с-верным', `${c.right} / ${t[c.correct]}`)
    if (!c.right) bad('нет-right')
    if (!c.explain?.some(Boolean)) bad('нет-разбора')
    if (c.sentence && batchimWrong(c.right, c.sentence.pre.slice(-1) || undefined)) bad('верная-частица-не-по-받침', `${c.sentence.pre}[${c.right}]${c.sentence.post}`)
    if (c.sentence) {
      for (const [a, b] of TWINS) if (t.includes(a) && t.includes(b) && (c.right === a || c.right === b)) bad('второй-верный-двойник', `${a}/${b} в ${c.sentence.pre}___${c.sentence.post}`)
    }
  } else if (q.type === 'type') {
    if (!q.answers?.length || q.answers.some(a => !a.trim())) bad('нет-ответов-для-ввода')
  } else if (q.type === 'build') {
    const b = q as BuildQ
    if (!b.tiles.length || !b.accept.length) bad('пустая-сборка')
    else {
      const w = b.accept[0]!.split(/\s+/).filter(Boolean)
      const pool = [...b.tiles]
      for (const x of w) {
        const k = pool.indexOf(x)
        if (k < 0) bad('нет-плитки-для-слова', x)
        else pool.splice(k, 1)
      }
      if (b.check && !b.check(w)) bad('check-не-принимает-верный-порядок', b.accept[0]!)
    }
  } else if (q.type === 'story') {
    const s = q as StoryQ
    const lv = g.level
    const [lo, hi] = SENT_RANGE_OF[g.mode]?.[lv] ?? SENT_RANGE[lv] ?? [1, 1]
    if (g.mode !== 'expert' && g.mode !== 'han' && lv !== 'simple' && (s.sents.length < lo || s.sents.length > hi)) bad('размер-текста-вне-чипа', `${s.sents.length} предложений, чип ждёт ${lo}–${hi}`)
    if (g.mode === 'expert') {
      const want = { simple: 5, story: 10, long: 15 }[lv] ?? 5
      if (s.gaps.length !== want) bad('пропусков-не-столько-сколько-в-чипе', `${s.gaps.length} вместо ${want}`)
    }
    const kos = s.sents.map(x => x.ko)
    if (new Set(kos).size !== kos.length) bad('повтор-предложения-в-тексте')
    if (!s.gaps.length) bad('нет-пропусков')
    for (const sn of s.sents) {
      sn.parts.forEach((p, k) => {
        if (p.gap === undefined) return
        const gp = s.gaps[p.gap]
        const prev = sn.parts[k - 1]
        if (gp && !gp.input && prev && !prev.mark && prev.t && batchimWrong(gp.right, prev.t.slice(-1))) bad('верная-частица-не-по-받침', `${prev.t.slice(-4)}[${gp.right}] в «${sn.ko}»`)
      })
    }
    for (const gp of s.gaps) {
      if (!gp.right) bad('пропуск-без-ответа')
      else if (!gp.input && !s.bank.includes(gp.right)) bad('ответа-нет-в-банке', gp.right)
    }
    if (!s.input && new Set(s.bank).size !== s.bank.length) bad('повтор-в-банке')
    for (const x of s.sents) if (!x.ko.trim()) bad('пустое-предложение')
  } else {
    bad('неизвестный-тип', q.type)
  }

  // только пройденное: запреты из /api/public/rules (те же, что у десктопного Claude)
  const { ko, ru } = sentencesOf(q)
  for (const k of ko) for (const f of checkSentence(k).filter(f => f.severity === 'forbid')) bad('не-пройдено:' + f.rule, k)
  for (const r of ru) for (const f of checkSentence('', r).filter(f => f.severity === 'forbid')) bad('русский-перевод:' + f.rule, r)
  return v
}

/** Слова словаря игры (STUDY) и переводы: для проверки «слова только из STUDY». */
export const STUDY_KO = new Set(STUDY.map(d => d.k))
export const STUDY_SENT = new Set(Object.keys(STUDY_TRANSLATIONS))
