import { PFAMS, type RuleFamily } from '@/game/families'
import { ptextPool, type PtextMark } from '@/game/ptext-pool'
import { CONJUGATIONS, futureForm } from './conjugation'
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
export const EXAM_PARTS = 4
/** Сколько пунктов примерно в полном экзамене (для подписей до начала): 4 части по ~65. */
export const EXAM_POINTS_APPROX = 260
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
/** Правила без частиц: слова-плитки (связка, отрицание, наличие, положение) и формы глаголов (вводом). Подписи для таблицы результатов. */
export const WORD_RULES: { id: string; label: string }[] = [
  { id: 'iyo', label: '이에요 / 예요' },
  { id: 'anie', label: '이 / 가 아니에요' },
  { id: 'have', label: '있다 / 없다' },
  { id: 'pos', label: '앞 / 뒤 / 옆 / 위 / 아래' },
  { id: 'juse', label: '주세요 («дайте, пожалуйста»)' },
]
/** Указатели, вопросительные и счётные слова: плитки в отдельных блоках (у каждого свой набор плиток). */
export const DEM_RULE = { id: 'dem', label: '이 / 그 / 저 (указатели)' }
export const QW_RULE = { id: 'qw', label: 'Вопросительные слова' }
export const CNT_RULE = { id: 'cnt', label: 'Счётные слова' }
/** Числа, даты и цены вводом; разговорные формулы (ситуация → фраза). */
export const NUM_RULE = { id: 'num', label: 'Числа, даты и цены' }
export const PHR_RULE = { id: 'phr', label: 'Разговорные формулы' }
export const FORM_RULES: { id: string; label: string }[] = [
  { id: 'ayo', label: 'Настоящее время (-아요/어요)' },
  { id: 'past', label: 'Прошедшее время (-았어요/었어요)' },
  { id: 'future_my', label: 'Будущее время (-(으)ㄹ 거예요)' },
  { id: 'an', label: 'Отрицание «안»' },
]
/** Название правила для таблицы результатов. */
export const ruleLabel = (id: string) => PFAMS.find(f => f.id === id)?.name ?? [...WORD_RULES, ...FORM_RULES, DEM_RULE, QW_RULE, CNT_RULE, NUM_RULE, PHR_RULE].find(r => r.id === id)?.label ?? id

/** Частица в разборе принадлежит правилу: по карточке (`g`) и тексту; у 와 / 과 разбор карточки не указывает (как в `inFam` игры). */
const inRule = (f: RuleFamily, m: PtextMark) => f.marks.includes(m.text) && (f.g.includes(m.g) || (f.id === 'and' && (m.text === '와' || m.text === '과')))

/**
 * Какие ещё ответы в пропуске тоже верны. У 은/는 и 이/가 по смыслу предложения не отличить (컵은 / 컵이 책상 위에 있어요), поэтому принимается и пара-двойник
 * с той же 받침 (는 ↔ 가, 은 ↔ 이); у 하고 / 와 / 과 принимаются все три.
 */
const SWAP: Record<string, string> = { 은: '이', 는: '가', 이: '은', 가: '는' }
const hasBatchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return c >= 0 && c <= 11171 && c % 28 !== 0
}
/** `before`: предложение до пропуска. 저는 / 나는 / 너는 с 가 не меняются (это 제가, 내가, 네가: другое слово), 와 / 과 выбирается по 받침. */
const ACCEPT = (m: { text: string; rule: string }, before: string): string[] | undefined => {
  if (m.rule === 'and') {
    const noun = before.trim()
    return ['하고', hasBatchim(noun) ? '과' : '와'].filter(x => x !== m.text)
  }
  if (m.text === '는' && /(^|\s)(저|나|너)$/.test(before)) return undefined
  return SWAP[m.text] ? [SWAP[m.text]!] : undefined
}

/** Часть предложения: просто текст или пропуск с верным ответом и правилом. */
export type ExamPiece = string | { answer: string; accept?: string[]; rule: string }
export interface ExamSentence { ru: string; ko: string; pieces: ExamPiece[] }

export type ExamBlock =
  /** Текст с пропусками: частицы ставятся плитками (typed: false) или вписываются с клавиатуры (typed: true). */
  | { kind: 'gaps'; id: string; title: string; note: string; typed: boolean; bank: string[]; sentences: ExamSentence[] }
  /** К каждому корейскому предложению выбрать его перевод из списка. */
  | { kind: 'match'; id: string; title: string; note: string; items: { ko: string; ru: string; rule: string }[]; choices: string[] }
  /** Собрать предложение из слов в правильном порядке. */
  | { kind: 'order'; id: string; title: string; note: string; items: { ru: string; ko: string; words: string[]; alts?: string[]; rule: string }[] }
  /** Про каждое предложение сказать, верное оно или с ошибкой. */
  | { kind: 'errors'; id: string; title: string; note: string; items: { ko: string; ru: string; bad: boolean; rule: string }[] }
  /** Вписать форму глагола, которую просит задание (настоящее, прошедшее, будущее, отрицание). */
  | { kind: 'forms'; id: string; title: string; note: string; items: { k: string; ru: string; task: string; answer: string; rule: string }[] }

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
/** Ответы в части, которая ещё не закончена: по ключам `блок:предложение:часть` (пропуски) и `блок:номер` (остальное). */
export interface PartAnswers { gap: Record<string, string>; pick: Record<string, string>; built: Record<string, number[]>; verdict: Record<string, boolean> }
/** Черновик экзамена на сервере: задания всех частей, результаты сохранённых (null, пока часть не пройдена) и неоконченная часть («Сохранить и выйти»). */
export interface ExamDraft { v: 1; startedAt: number; parts: ExamBlock[][]; results: (PointResult[] | null)[]; partial?: { part: number; answers: PartAnswers } }
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

/**
 * Другие верные порядки слов: в корейском группы с частицей (и слова времени) меняются местами, сказуемое (со словами перед ним) остаётся в конце.
 * Слово без частицы держится за следующим («제 책이», «두 명 있어요»). Не больше четырёх групп.
 */
const PARTICLE_END = /(은|는|이|가|을|를|에|에서|도|만|와|과|하고|에게|한테|까지|부터)$/
const TIME_WORDS = new Set(['오늘', '내일', '어제', '지금', '매일', '아침', '저녁', '주말', '그리고'])
export function altOrders(ko: string): string[] {
  const words = ko.split(/\s+/)
  const groups: string[][] = []
  let cur: string[] = []
  words.slice(0, -1).forEach(w => {
    cur.push(w)
    if (TIME_WORDS.has(w) || (w.length > 1 && PARTICLE_END.test(w))) {
      groups.push(cur)
      cur = []
    }
  })
  const tail = [...cur, words[words.length - 1]!]
  if (groups.length < 2 || groups.length > 4) return []
  const out: string[] = []
  const walk = (left: string[][], acc: string[][]) => {
    if (!left.length) return void out.push([...acc.flat(), ...tail].join(' '))
    left.forEach((g, i) => walk([...left.slice(0, i), ...left.slice(i + 1)], [...acc, g]))
  }
  walk(groups, [])
  return out.filter(x => x !== ko)
}

/** Плитки блоков со словами: связка, отрицание, наличие и положение; указатели; вопросительные слова; счётные слова. */
const WORD_BANK = ['이에요', '예요', '이 아니에요', '가 아니에요', '있어요', '없어요', '앞', '뒤', '옆', '위', '아래', '주세요']
const DEM_BANK = ['이', '그', '저', '이것', '그것', '저것', '여기', '거기', '저기']
const QW_BANK = ['누구', '뭐', '어디', '언제', '얼마', '몇', '무슨', '어느']
const CNT_BANK = ['개', '명', '마리', '권', '장', '병', '잔', '그릇']
type WMark = { at: number; text: string; rule: string }
/** Указатель подходит для пропуска, только если перевод его однозначно выдаёт: «этот / здесь» → 이 / 여기, «вон тот / вон там» → 저, «тот / там» → 그 / 거기. */
const demOk = (w: string, ru: string) =>
  /^이/.test(w) || w === '여기' ? /[Ээ]т(от|а|о|у|и)|Здесь|здесь|Это/.test(ru) : /^저/.test(w) ? /вон/i.test(ru) : /^(그|거기)/.test(w) ? /(Тот|тот|Та |та |Там|там)/.test(ru) && !/вон/i.test(ru) : false
/** Слова-пропуски предложения для правил без частиц: ищем по тексту (связка в конце, «이 / 가 아니에요», 있어요 / 없어요, слова положения перед 에, указатели, вопросительные и счётные слова). */
function wordMarks(ko: string, ru: string): WMark[] {
  const out: WMark[] = []
  const add = (re: RegExp, rule: string, ok: (w: string) => boolean = () => true) => {
    for (const m of ko.matchAll(re)) if (ok(m[0])) out.push({ at: m.index!, text: m[0], rule })
  }
  add(/(?<=^|\s)(이것|그것|저것|여기|거기|저기)(?=[은는이가을를도에]|\s|[.?!,]|$)/g, 'dem', w => demOk(w, ru))
  add(/(?<=^|\s)(이|그|저)(?= [가-힣])/g, 'dem', w => demOk(w, ru))
  add(/(?<=^|\s)(누구|뭐|어디|언제|얼마|몇|무슨|어느)(?=[가-힣]|\s|[.?!,]|$)/g, 'qw')
  add(/(?<=(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|몇|스무) )(개|명|마리|권|장|병|잔|그릇)/g, 'cnt')
  add(/(?<!거)(이에요|예요)(?=[.?!]|$)/g, 'iyo')
  add(/(이|가) 아니에요/g, 'anie')
  add(/(있어요|없어요)(?=[.?!]|$)/g, 'have')
  add(/(?<=^|\s)(앞|뒤|옆|위|아래)(?=에|\s|[.?!,]|$)/g, 'pos')
  add(/(주세요)(?=[.?!]|$)/g, 'juse')
  return out
}
const FORM_TASK: Record<string, string> = {
  ayo: 'настоящее время (-아요/어요)',
  past: 'прошедшее время (-았어요/었어요)',
  future_my: 'будущее время (-(으)ㄹ 거예요)',
  an: 'отрицание с «안» (настоящее время)',
}

/** Китайское число словами: 3000 → 삼천, 12000 → 만 이천 (перед 십 / 백 / 천 / 만 единица «일» не говорится). */
export function sinoNumber(n: number): string {
  const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  if (n === 0) return '영'
  const small = (x: number) => {
    let out = ''
    for (const [unit, name] of [[1000, '천'], [100, '백'], [10, '십']] as const) {
      const d = Math.floor(x / unit)
      x %= unit
      if (d) out += (d === 1 ? '' : D[d]!) + name
    }
    return out + D[x]!
  }
  const man = Math.floor(n / 10000)
  return (man ? (man === 1 ? '' : small(man)) + '만' : '') + small(n % 10000)
}
const MONTHS = ['일월', '이월', '삼월', '사월', '오월', '유월', '칠월', '팔월', '구월', '시월', '십일월', '십이월']
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const NATIVE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열']
const COUNTERS: [string, string][] = [['개', 'штуки'], ['명', 'человек'], ['마리', 'животных'], ['권', 'книг'], ['장', 'листов, билетов'], ['병', 'бутылки'], ['잔', 'чашки, стаканы'], ['그릇', 'порции в миске']]
const PRICES = [500, 800, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 7000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 50000]
/** Разговорные формулы платформы: фраза и ситуация, в которой её говорят. */
const PHRASES: [string, string][] = [
  ['안녕하세요?', 'Приветствие: «Здравствуйте»'],
  ['만나서 반가워요.', 'При знакомстве: «Приятно познакомиться»'],
  ['안녕히 가세요.', 'Говорит тот, кто остаётся, тому, кто уходит'],
  ['안녕히 계세요.', 'Говорит тот, кто уходит, тому, кто остаётся'],
  ['주세요.', 'Просьба в магазине или кафе: «Дайте, пожалуйста»'],
  ['고마워요.', '«Спасибо» знакомым, вежливо'],
  ['감사합니다.', '«Спасибо» официально, на работе'],
  ['고마워.', '«Спасибо» близким друзьям'],
  ['맞아요.', '«Верно, правильно»'],
  ['틀려요.', '«Неверно, неправильно»'],
  ['내일 봐.', '«До завтра» близким друзьям'],
]

type RMark = PtextMark & { rule: string }
type Cand = { ko: string; ru: string; marks: RMark[] }

/**
 * Четыре части экзамена из предложений сайта (общий пул `ptextPool`), без повторов предложений между частями.
 * В каждой части семь блоков (в случайном порядке): текст с пропусками плитками (10 пунктов), ввод частиц (6), перевод (6), порядок слов (4),
 * поиск ошибок (6), «Подставь слово» плитками (связка, `이 / 가 아니에요`, `있다 / 없다`, слова положения: 10) и «Впиши форму глагола»
 * (настоящее, прошедшее, будущее, отрицание `안`: 10), всего около 52 пунктов в части. Пункты поровну раздаются правилам (у каждого пункта своё правило), чтобы по итогам был разбор по правилам.
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
  const count: Record<string, number> = Object.fromEntries([...ruleIds, ...WORD_RULES.map(r => r.id), ...FORM_RULES.map(r => r.id), DEM_RULE.id, QW_RULE.id, CNT_RULE.id, NUM_RULE.id, PHR_RULE.id].map(id => [id, 0]))
  /** Предложения для блока «Подставь слово» (связка, отрицание, наличие, положение). */
  const wpool = shuffle(ptextPool().map(x => ({ ko: x.ko, ru: x.ru, marks: wordMarks(x.ko, x.ru) })).filter(c => c.marks.length))
  const verbs = shuffle(CONJUGATIONS.filter(c => c.kind === 'verb'))
  const usedVerbs = new Set<string>()

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
  const piece = (m: RMark, before: string): ExamPiece => ({ answer: m.text, accept: ACCEPT(m, before), rule: m.rule })

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
        pieces.push(c.ko.slice(pos, m.at), piece(m, c.ko.slice(0, m.at)))
        pos = m.at + m.text.length
        count[m.rule]!++
        left--
      }
      pieces.push(c.ko.slice(pos))
      sentences.push({ ru: c.ru, ko: c.ko, pieces })
    }
    return { kind: 'gaps', id, title, note, typed, bank: typed ? [] : shuffle(BANK), sentences }
  }

  /** Блок с плитками для правил без частиц (одно правило на предложение): `ids` правила, `bank` плитки, перевод предложения подсказывает слово. */
  const tileBlock = (id: string, title: string, note: string, ids: string[], bank: string[], points: number): ExamBlock => {
    const sentences: ExamSentence[] = []
    for (let left = points; left > 0; left--) {
      const rule = nextRule(ids)
      const c = wpool.find(x => !used.has(x.ko) && !ruUsed.has(x.ru.toLowerCase()) && x.marks.some(m => m.rule === rule))
      if (!c) break
      used.add(c.ko)
      ruUsed.add(c.ru.toLowerCase())
      const m = shuffle(c.marks.filter(x => x.rule === rule))[0]!
      sentences.push({ ru: c.ru, ko: c.ko, pieces: [c.ko.slice(0, m.at), { answer: m.text, accept: m.text === '뭐' ? ['무엇'] : undefined, rule }, c.ko.slice(m.at + m.text.length)] })
      count[rule]!++
    }
    return { kind: 'gaps', id, title, note, typed: false, bank: shuffle(bank), sentences }
  }
  const wordBlock = (n: number, points: number) =>
    tileBlock(`words${n}`, 'Подставь слово', 'Нажми на пропуск и на плитку: связка, отрицание, «есть / нет» или слово положения. Перевод предложения подскажет, какое слово нужно.', WORD_RULES.map(r => r.id), WORD_BANK, points)
  /** Блок «Впиши форму глагола»: настоящее, прошедшее, будущее, отрицание; глагол в экзамене не повторяется. */
  const formsBlock = (n: number, points: number): ExamBlock => {
    const items: { k: string; ru: string; task: string; answer: string; rule: string }[] = []
    const ids = FORM_RULES.map(r => r.id)
    for (let i = 0; i < points; i++) {
      const rule = nextRule(ids)
      const c = verbs.find(v => !usedVerbs.has(v.k) && (rule !== 'future_my' || !!futureForm(v.k)))
      if (!c) break
      usedVerbs.add(c.k)
      const answer = rule === 'ayo' ? c.present : rule === 'past' ? c.past : rule === 'an' ? c.neg : futureForm(c.k)!
      items.push({ k: c.k, ru: c.t.split(/[;,(]/)[0]!.trim(), task: FORM_TASK[rule]!, answer, rule })
      count[rule]!++
    }
    return { kind: 'forms', id: `forms${n}`, title: 'Впиши форму глагола', note: 'Впиши форму, которую просит задание (вежливый стиль). Пробелы не важны.', items }
  }

  /** Числа вводом: дата (месяц и число, у 6 и 10 особые названия), цена в вонах, число для счёта + счётное слово. Пробелы не важны. */
  const usedNum = new Set<string>()
  const numbersBlock = (n: number, points: number): ExamBlock => {
    const items: { k: string; ru: string; task: string; answer: string; rule: string }[] = []
    for (let i = 0; i < points; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const kind = (i + tries) % 3
        let it: { k: string; ru: string; task: string; answer: string }
        if (kind === 0) {
          const m = Math.floor(Math.random() * 12)
          const d = 1 + Math.floor(Math.random() * 28)
          it = { k: `${d} ${MONTHS_RU[m]}`, ru: 'дата', task: 'месяц и число по-корейски (китайские числа, например 삼월 오일)', answer: `${MONTHS[m]} ${sinoNumber(d)}일` }
        } else if (kind === 1) {
          const price = PRICES[Math.floor(Math.random() * PRICES.length)]!
          it = { k: `${String(price).replace(/\B(?=(\d{3})+$)/g, ' ')} вон`, ru: 'цена', task: 'сумма по-корейски (китайские числа) со словом 원', answer: `${sinoNumber(price)} 원` }
        } else {
          const num = 1 + Math.floor(Math.random() * 10)
          const [counter, label] = COUNTERS[Math.floor(Math.random() * COUNTERS.length)]!
          it = { k: `${num} + ${counter}`, ru: `${num} ${label}`, task: 'корейское число для счёта и счётное слово (например 두 잔)', answer: `${NATIVE[num]} ${counter}` }
        }
        if (usedNum.has(it.k)) continue
        usedNum.add(it.k)
        items.push({ ...it, rule: NUM_RULE.id })
        count[NUM_RULE.id]!++
        break
      }
    }
    return { kind: 'forms', id: `numbers${n}`, title: 'Впиши по-корейски: дата, цена, счёт', note: 'Впиши по-корейски, как просит задание. Пробелы не важны (삼월 오일 и 삼 월 오 일 одно и то же).', items }
  }
  /** Разговорные формулы: к каждой фразе выбрать ситуацию. Фразы не повторяются, пока не кончится список (в части их 3, всего 11). */
  const phrasePool: [string, string][] = shuffle(PHRASES)
  const phrasesBlock = (n: number, points: number): ExamBlock => {
    const items: { ko: string; ru: string; rule: string }[] = []
    while (items.length < points) {
      if (!phrasePool.length) phrasePool.push(...shuffle(PHRASES).filter(p => !items.some(x => x.ko === p[0])))
      const [ko, ru] = phrasePool.pop()!
      if (items.some(x => x.ko === ko)) continue
      items.push({ ko, ru, rule: PHR_RULE.id })
      count[PHR_RULE.id]!++
    }
    return { kind: 'match', id: `phrases${n}`, title: 'Разговорные формулы', note: 'К каждой фразе выбери ситуацию, в которой её говорят.', items, choices: shuffle(items.map(x => x.ru)) }
  }

  const part = (n: number): ExamBlock[] => {
    const blocks: ExamBlock[] = []
    blocks.push(gapBlock(`tiles${n}`, 'Поставь частицы', 'Нажми на пропуск и на плитку (или сразу на плитку: она встанет в первый свободный пропуск). Чужие плитки лишние.', false, 8))
    blocks.push(gapBlock(`typed${n}`, 'Впиши частицы', 'Здесь плиток нет: впиши каждую частицу с клавиатуры.', true, 4))
    // перевод: 4 предложения
    const mi: { ko: string; ru: string; rule: string }[] = []
    for (let i = 0; i < 4; i++) {
      const rule = nextRule(ruleIds)
      const c = pick(rule)
      if (!c) break
      mi.push({ ko: c.ko, ru: c.ru, rule })
      count[rule]!++
    }
    blocks.push({ kind: 'match', id: `match${n}`, title: 'Переведи', note: 'Выбери для каждого предложения его перевод. Каждый перевод подходит только одному.', items: mi, choices: shuffle(mi.map(x => x.ru)) })
    // порядок слов: 4 предложения из 3–6 слов
    const oi: { ru: string; ko: string; words: string[]; alts?: string[]; rule: string }[] = []
    for (let i = 0; i < 4; i++) {
      const rule = nextRule(ruleIds)
      const c = pick(rule, x => {
        const w = bare(x.ko).split(/\s+/).length
        return w >= 3 && w <= 6
      })
      if (!c) break
      oi.push({ ru: c.ru, ko: bare(c.ko), words: shuffle(bare(c.ko).split(/\s+/)), alts: altOrders(bare(c.ko)), rule })
      count[rule]!++
    }
    blocks.push({ kind: 'order', id: `order${n}`, title: 'Расставь слова по порядку', note: 'Нажимай на слова, чтобы собрать предложение; нажми на собранное слово, чтобы убрать его.', items: oi })
    // ошибки: половина предложений испорчена подменой двойника (только у правил с двойниками по 받침)
    const twinnable = ruleIds.filter(id => rules.find(r => r.id === id)!.marks.some(m => TWIN[m]))
    const ei: { ko: string; ru: string; bad: boolean; rule: string }[] = []
    for (let i = 0; i < 3; i++) {
      const rule = nextRule(twinnable)
      const c = pick(rule, undefined, m => !!TWIN[m.text])
      if (!c) break
      const m = markOf(c, rule, x => !!TWIN[x.text])!
      ei.push({ ko: cut(c.ko, m, TWIN[m.text]!), ru: c.ru, bad: true, rule })
      count[rule]!++
    }
    for (let i = 0; i < 3; i++) {
      const rule = nextRule(ruleIds)
      const c = pick(rule)
      if (!c) break
      ei.push({ ko: c.ko, ru: c.ru, bad: false, rule })
      count[rule]!++
    }
    blocks.push({ kind: 'errors', id: `errors${n}`, title: 'Найди ошибки', note: 'Про каждое предложение скажи: оно верное или в нём ошибка в частице.', items: shuffle(ei) })
    blocks.push(wordBlock(n, 10), formsBlock(n, 8), numbersBlock(n, 6), phrasesBlock(n, 3))
    blocks.push(tileBlock(`dem${n}`, 'Подставь указатель', 'Этот, тот, вон тот; здесь, там, вон там. Перевод подскажет, какой нужен.', [DEM_RULE.id], DEM_BANK, 4))
    blocks.push(tileBlock(`qw${n}`, 'Подставь вопросительное слово', 'Кто, что, где, когда, сколько: по переводу выбери нужное слово.', [QW_RULE.id], QW_BANK, 4))
    blocks.push(tileBlock(`cnt${n}`, 'Подставь счётное слово', 'Штуки, люди, бутылки, чашки: по переводу выбери счётное слово.', [CNT_RULE.id], CNT_BANK, 4))
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
