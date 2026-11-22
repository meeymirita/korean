import { clipText, type ClipWord } from './clip'
import { VLOGS, type Vlog } from './vlogs'
import { passes } from './vlog-study'

/**
 * Языковые срезы по всем влогам (один проход рассказа, без повторов): слова и охват, разговорник по ситуациям, шаблоны фраз.
 * Считается один раз при первом обращении и только в браузере; нужен только владельцу (влоги закрыты токеном). Ничего не записывает и не засчитывает.
 */
export interface PhraseHit {
  id: string
  title: string
  i: number
  s: number
  ko: string
  ru: string
  /** доля слов фразы из твоего словаря, 0–1 */
  known: number
}

const firstOf = (v: Vlog) => passes(v.lines).first

// ——— слова ———
interface VlogTokens { words: ClipWord[]; phrases: { ko: string; ru: string; s: number; known: number }[] }
const tokenCache = new Map<string, VlogTokens>()
/** Слова влога по порядку, с повторами (по числу раз, как они звучат), и фразы с долей знакомых слов. */
export function tokensOf(v: Vlog): VlogTokens {
  const hit = tokenCache.get(v.id)
  if (hit) return hit
  const out: VlogTokens = { words: [], phrases: [] }
  for (const l of firstOf(v)) {
    const r = clipText(l.ko, () => 0)
    out.phrases.push({ ko: l.ko, ru: l.ru, s: l.s, known: r.total ? r.known / r.total : 0 })
    for (const p of r.parts) if (p.word) out.words.push(p.word)
  }
  tokenCache.set(v.id, out)
  return out
}

/** Охват влога: сколько слов текста из твоего словаря (с повторами), в процентах. */
export function coverageOf(v: Vlog): { total: number; known: number; pct: number } {
  const w = tokensOf(v).words
  const known = w.filter(x => x.own).length
  return { total: w.length, known, pct: w.length ? Math.round((known / w.length) * 100) : 0 }
}

export interface MissingWord { word: ClipWord; n: number }
/** Какие слова выучить, чтобы понимать `target` (0–1) слов влога: самые частые из незнакомых, пока охват не дойдёт до цели. */
export function missingFor(v: Vlog, target = 0.9): { pct: number; list: MissingWord[]; reached: boolean } {
  const { words } = tokensOf(v)
  const total = words.length
  let known = words.filter(x => x.own).length
  const freq = new Map<string, MissingWord>()
  for (const w of words) if (!w.own) (freq.get(w.key) ?? freq.set(w.key, { word: w, n: 0 }).get(w.key)!).n++
  const sorted = [...freq.values()].sort((a, b) => b.n - a.n)
  const list: MissingWord[] = []
  const pct = total ? Math.round((known / total) * 100) : 0
  for (const e of sorted) {
    if (!total || known / total >= target) break
    list.push(e)
    known += e.n
  }
  return { pct, list, reached: !total || known / total >= target }
}

export interface CoreWord { key: string; word: ClipWord; vlogs: number; n: number }
let core: CoreWord[] | null = null
/** Слова, которые звучат в нескольких влогах сразу: по числу влогов, потом по числу раз. */
export function coreWords(minVlogs = 3): CoreWord[] {
  if (!core) {
    const m = new Map<string, { word: ClipWord; vlogs: Set<string>; n: number }>()
    for (const v of VLOGS) {
      for (const w of tokensOf(v).words) {
        const e = m.get(w.key) ?? m.set(w.key, { word: w, vlogs: new Set(), n: 0 }).get(w.key)!
        e.vlogs.add(v.id)
        e.n++
      }
    }
    core = [...m].map(([key, e]) => ({ key, word: e.word, vlogs: e.vlogs.size, n: e.n })).sort((a, b) => b.vlogs - a.vlogs || b.n - a.n)
  }
  return core.filter(c => c.vlogs >= minVlogs)
}

// ——— фразы по ситуациям ———
export interface Scene { id: string; label: string; keys: string[] }
/** Ситуации разговорника: фраза относится к ситуации, если в ней есть одно из слов `keys`. */
export const SCENES: Scene[] = [
  { id: 'cafe', label: 'Кафе и заказ', keys: ['커피', '카페', '주문', '음료', '메뉴', '시켜', '마셔요', '마셨어요'] },
  { id: 'shop', label: 'Магазин и деньги', keys: ['얼마', '계산', '가격', '비싸', '싸요', '사요', '샀어요', '가게', '마트', '편의점', '카드', '현금', '영수증'] },
  { id: 'health', label: 'Аптека и здоровье', keys: ['약국', '약을', '아파요', '아팠어요', '병원', '감기', '열이', '기침', '몸이'] },
  { id: 'move', label: 'Транспорт и дорога', keys: ['지하철', '버스', '기차', '택시', '비행기', '공항', '역에', '출발', '도착', '내려요', '타요'] },
  { id: 'intro', label: 'Знакомство', keys: ['안녕하세요', '이름', '만나서', '반갑', '소개', '처음 뵙'] },
  { id: 'home', label: 'Дом и день', keys: ['아침', '일어나', '씻어요', '청소', '빨래', '설거지', '집에서', '집에 와'] },
  { id: 'feel', label: 'Погода и чувства', keys: ['날씨', '기분', '더워요', '추워요', '시원', '따뜻', '행복'] },
]

let phrases: PhraseHit[] | null = null
/** Все фразы всех влогов (один проход рассказа) с долей знакомых слов; считается один раз. */
export function allPhrases(): PhraseHit[] {
  if (!phrases) {
    phrases = []
    for (const v of VLOGS) tokensOf(v).phrases.forEach((p, i) => phrases!.push({ id: v.id, title: v.title, i, s: p.s, ko: p.ko, ru: p.ru, known: p.known }))
  }
  return phrases
}

/** Короткие фразы ситуации, разные по тексту и по влогам вперемешку (по кругу), не больше `limit`; `minKnown` оставляет только понятные. */
export function sceneChunk(scene: Scene, limit = 12, minKnown = 0): PhraseHit[] {
  const seen = new Set<string>()
  const byVlog = new Map<string, PhraseHit[]>()
  for (const p of allPhrases()) {
    if (p.ko.length < 6 || p.ko.length > 26 || p.known < minKnown || seen.has(p.ko) || !scene.keys.some(k => p.ko.includes(k))) continue
    seen.add(p.ko)
    ;(byVlog.get(p.id) ?? byVlog.set(p.id, []).get(p.id)!).push(p)
  }
  const lists = [...byVlog.values()].map(l => l.sort((a, b) => a.ko.length - b.ko.length))
  const out: PhraseHit[] = []
  for (let r = 0; out.length < limit; r++) {
    const row = lists.flatMap(l => (l[r] ? [l[r]!] : []))
    if (!row.length) break
    out.push(...row.slice(0, limit - out.length))
  }
  return out
}

// ——— шаблоны фраз ———
export interface Pattern {
  id: string
  /** как записан каркас */
  label: string
  /** по-русски, что значит */
  ru: string
  /** какая часть фразы подсвечивается (первое совпадение) */
  re: RegExp
  /** карточка грамматики, по которой видно статус (`grammar.ts`, `id`); пусто: самая простая конструкция */
  gram?: string
}
export const PATTERNS: Pattern[] = [
  { id: 'like', label: '저는 ___을/를 좋아해요', ru: 'я люблю …', re: /[가-힣]+(을|를) 좋아해요/ },
  { id: 'have', label: '___이/가 있어요', ru: 'есть …', re: /[가-힣]+(이|가) 있어요/ },
  { id: 'is', label: '___이에요 / 예요', ru: '… это …', re: /[가-힣]+(이에요|예요)/, gram: 'iyo' },
  { id: 'at', label: '___에서 ___해요', ru: 'делаю … в (где-то)', re: /[가-힣]+에서/, gram: 'eseo' },
  { id: 'go', label: '___에 가요 / 갔어요', ru: 'иду / ходил(а) куда-то', re: /[가-힣]+에 (가요|갔어요|갑니다)/, gram: 'gada' },
  { id: 'past', label: '___았어요 / 었어요', ru: 'прошедшее время', re: /[가-힣]+(았|었|했)어요/, gram: 'past_my' },
  { id: 'want', label: '___고 싶어요', ru: 'хочу …', re: /[가-힣]+고 싶어요/ },
  { id: 'will', label: '___ㄹ 거예요', ru: 'буду …', re: /[가-힣]+ 거예요/, gram: 'future_my' },
]

/** Примеры шаблона из влогов: короткие, разные, по кругу по влогам, не больше `limit`. */
export function patternExamples(p: Pattern, limit = 6): (PhraseHit & { mark: string })[] {
  const byVlog = new Map<string, (PhraseHit & { mark: string })[]>()
  const seen = new Set<string>()
  for (const h of allPhrases()) {
    const m = p.re.exec(h.ko)
    if (!m || h.ko.length > 28 || seen.has(h.ko)) continue
    seen.add(h.ko)
    ;(byVlog.get(h.id) ?? byVlog.set(h.id, []).get(h.id)!).push({ ...h, mark: m[0] })
  }
  const lists = [...byVlog.values()].map(l => l.sort((a, b) => a.ko.length - b.ko.length))
  const out: (PhraseHit & { mark: string })[] = []
  for (let r = 0; out.length < limit; r++) {
    const row = lists.flatMap(l => (l[r] ? [l[r]!] : []))
    if (!row.length) break
    out.push(...row.slice(0, limit - out.length))
  }
  return out
}
