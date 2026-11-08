/**
 * Формы слова по правилам: спряжение глагола и прилагательного, существительное с частицами.
 * Знает правильные слова и частые исключения (ㅂ, ㄷ, ㅅ, 르, ㅎ, ㅡ, ㄹ, 하다). Редких исключений не знает:
 * на странице слова стоит пометка, что формы построены по правилам.
 */

export interface FormRow { label: string; ko: string; ru: string }

const BASE = 0xac00
const isH = (c: string | undefined): c is string => !!c && c >= '가' && c <= '힣'
const split = (c: string): [number, number, number] => {
  const n = c.charCodeAt(0) - BASE
  return [Math.floor(n / 588), Math.floor((n % 588) / 28), n % 28]
}
const make = (l: number, v: number, t = 0) => String.fromCharCode(BASE + l * 588 + v * 28 + t)

/** индексы гласных и конечных согласных (батчим) в таблице Юникода */
const V = { a: 0, ae: 1, ya: 2, yae: 3, eo: 4, e: 5, yeo: 6, o: 8, wa: 9, wae: 10, u: 13, wo: 14, eu: 18, i: 20 }
const T = { n: 4, d: 7, l: 8, b: 17, s: 19, ss: 20, h: 27 }

const last = (s: string) => s[s.length - 1]!
const head = (s: string) => s.slice(0, -1)
const vOf = (c: string) => split(c)[1]
const tOf = (c: string) => split(c)[2]
const withT = (c: string, t: number) => { const [l, v] = split(c); return make(l, v, t) }
const withV = (c: string, v: number) => { const [l, , t] = split(c); return make(l, v, t) }
const addT = (s: string, t: number) => head(s) + withT(last(s), t)
const hasBatchim = (w: string) => tOf(last(w)) !== 0
/** «아» после ㅏ/ㅗ, иначе «어» */
const harmony = (syl: string) => (vOf(syl) === V.a || vOf(syl) === V.o ? '아' : '어')

/** ㅂ-основы, которые изменяются (прилагательные почти всегда; глаголы только эти) */
const B_VERBS = ['돕', '눕', '굽', '줍']
/** ㅂ-слова, которые НЕ меняются */
const B_REGULAR = ['입', '잡', '좁', '씹', '뽑', '접', '집', '업', '꼽']
const B_OW = ['돕', '곱']
const D_IRR = ['듣', '걷', '묻', '싣', '깨닫', '긷']
const S_IRR = ['낫', '짓', '붓', '잇', '긋', '젓']
const H_REGULAR = ['좋', '낳', '넣', '놓', '쌓', '닿', '찧']
const REU_REGULAR = ['따르', '치르', '들르', '다다르', '우러르', '이르']

type Kind = 'reg' | 'ha' | 'b' | 'd' | 's' | 'reu' | 'h' | 'eu' | 'l'

function kindOf(stem: string, adj: boolean): Kind {
  const c = last(stem)
  const t = tOf(c)
  if (c === '하') return 'ha'
  if (t === T.b) {
    if (B_REGULAR.includes(c)) return 'reg'
    return adj || B_VERBS.includes(c) ? 'b' : 'reg'
  }
  if (t === T.d && D_IRR.some(x => stem.endsWith(x))) return 'd'
  if (t === T.s && S_IRR.some(x => stem.endsWith(x))) return 's'
  if (t === T.h && adj && !H_REGULAR.includes(c)) return 'h'
  if (stem.length >= 2 && c === '르' && !REU_REGULAR.some(x => stem.endsWith(x))) return 'reu'
  if (t === 0 && vOf(c) === V.eu) return 'eu'
  if (t === T.l) return 'l'
  return 'reg'
}

/** Основа перед «а/о»-окончанием (아/어): 가 → 가, 먹 → 먹어, 하 → 해, 오 → 와, 덥 → 더워, 쓰 → 써 */
function aeo(stem: string, kind: Kind): string {
  const c = last(stem)
  const hd = head(stem)
  if (kind === 'ha') return hd + '해'
  if (kind === 'b') return hd + withT(c, 0) + (B_OW.includes(c) ? '와' : '워')
  if (kind === 'd') return hd + withT(c, T.l) + harmony(c)
  if (kind === 's') return hd + withT(c, 0) + harmony(c)
  if (kind === 'reu') {
    const p = last(hd)
    if (!p) return stem + '러'
    return head(hd) + withT(p, T.l) + (harmony(p) === '아' ? '라' : '러')
  }
  if (kind === 'h') {
    const v = vOf(c)
    return hd + withV(withT(c, 0), v === V.ya ? V.yae : V.ae)
  }
  if (kind === 'eu') {
    const p = last(hd)
    const a = p && harmony(p) === '아'
    return hd + make(split(c)[0], a ? V.a : V.eo)
  }
  if (hasBatchim(stem)) return stem + harmony(c)
  const v = vOf(c)
  if (v === V.o) return hd + withV(c, V.wa)
  if (v === V.u) return hd + withV(c, V.wo)
  if (v === V.i) return hd + withV(c, V.yeo)
  if (v === 11) return hd + withV(c, V.wae) // 되 → 돼
  if ([V.a, V.eo, V.e, V.ae, V.yeo].includes(v)) return stem
  return stem + harmony(c)
}

/** Основа перед окончанием на «으» (으세요, 을, 은): vowelEnd — нужен ли просто ㄹ/ㄴ/ㅂ вместо «으». */
function uStem(stem: string, kind: Kind): { s: string; vowelEnd: boolean } {
  const c = last(stem)
  const hd = head(stem)
  if (kind === 'b') return { s: hd + withT(c, 0) + '우', vowelEnd: true }
  if (kind === 'd') return { s: hd + withT(c, T.l), vowelEnd: false }
  if (kind === 's') return { s: hd + withT(c, 0), vowelEnd: false }
  if (kind === 'h') return { s: hd + withT(c, 0), vowelEnd: true }
  if (kind === 'l') return { s: hd + withT(c, 0), vowelEnd: true }
  return { s: stem, vowelEnd: !hasBatchim(stem) }
}

/** Основа + ㄹ/ㄴ (если гласная в конце) или + «을/은» (если согласная) */
function withU(stem: string, kind: Kind, t: number, plain: string): string {
  const u = uStem(stem, kind)
  return u.vowelEnd ? addT(u.s, t) : u.s + plain
}

export function conjugate(word: string, posKo: string): FormRow[] | null {
  const verb = posKo === '동사' || posKo === '보조 동사'
  const adj = posKo === '형용사' || posKo === '보조 형용사'
  if (!(verb || adj) || word.length < 2 || !word.endsWith('다') || ![...word].every(isH)) return null
  const stem = head(word)
  const kind = kindOf(stem, adj)
  const ao = aeo(stem, kind)
  const u = uStem(stem, kind)
  const formal = kind === 'l' ? addT(u.s, T.b) + '니다' : hasBatchim(stem) ? stem + '습니다' : addT(stem, T.b) + '니다'
  const future = kind === 'l' ? stem + ' 거예요' : withU(stem, kind, T.l, '을') + ' 거예요'
  const imper = kind === 'l' || u.vowelEnd ? u.s + '세요' : u.s + '으세요'
  const attr = adj ? withU(stem, kind, T.n, '은') : kind === 'l' ? u.s + '는' : stem + '는'
  const rows: FormRow[] = [
    { label: 'Начальная форма', ko: word, ru: 'так слово лежит в словаре' },
    { label: 'Вежливая форма (наст.)', ko: ao + '요', ru: 'обычная вежливая речь, настоящее время' },
    { label: 'Формальная форма', ko: formal, ru: 'официальный стиль: новости, речи, объявления' },
    { label: 'Прошедшее время', ko: addT(ao, T.ss) + '어요', ru: 'вежливая форма, прошедшее время' },
    { label: 'Будущее время', ko: future, ru: 'вежливая форма: «буду…», «наверное…»' },
  ]
  if (verb) rows.push({ label: 'Повелительная форма', ko: imper, ru: 'вежливая просьба: «…те»' })
  rows.push({ label: 'Отрицание', ko: stem + '지 않아요', ru: 'не…' })
  if (verb) rows.push({ label: 'Запретительная форма', ko: stem + '지 마세요', ru: 'не…те' })
  if (verb) rows.push({ label: 'Желание', ko: stem + '고 싶어요', ru: 'хочу…' })
  rows.push({ label: 'Связка «и / поэтому»', ko: ao + '서', ru: '«…и затем», «…поэтому»' })
  rows.push({ label: adj ? 'Определение (какой)' : 'Определение (который…)', ko: attr, ru: 'форма перед существительным' })
  return rows
}

/** Существительное с частицами: выбор по последнему звуку (батчиму). */
export function withParticles(word: string): FormRow[] | null {
  if (!word || word.includes(' ') || !isH(last(word))) return null
  const b = hasBatchim(word)
  return [
    { label: 'Основная форма', ko: word, ru: 'как в словаре' },
    { label: 'Подлежащее (이/가)', ko: word + (b ? '이' : '가'), ru: 'кто или что делает' },
    { label: 'Тема (은/는)', ko: word + (b ? '은' : '는'), ru: 'а что до…' },
    { label: 'Объект (을/를)', ko: word + (b ? '을' : '를'), ru: 'кого или что' },
    { label: 'Принадлежность (의)', ko: word + '의', ru: 'чей' },
    { label: 'Тоже (도)', ko: word + '도', ru: 'тоже, даже' },
    { label: 'Вместе (와/과)', ko: word + (b ? '과' : '와'), ru: 'и; вместе с' },
    { label: 'Место (에서)', ko: word + '에서', ru: 'где происходит действие; откуда' },
    { label: 'Направление (에)', ko: word + '에', ru: 'куда; где находится; когда' },
    { label: 'Это… (이에요/예요)', ko: word + (b ? '이에요' : '예요'), ru: 'это …; я …' },
    { label: 'Много (들)', ko: word + '들', ru: 'множественное число' },
  ]
}
