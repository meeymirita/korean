import { CONJUGATIONS, type Conjugation } from './conjugation'

/** Есть ли у слова 받침 (согласная внизу последнего слога). */
export const hasBatchim = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return c >= 0 && c < 11172 && c % 28 !== 0
}

/* ---------- Конструктор: слово + частица, глагол + окончание ---------- */

export interface LabNoun {
  k: string
  ru: string
}
/** Простые слова для конструктора (все из словаря первых уроков). */
export const NOUNS: LabNoun[] = [
  { k: '저', ru: 'я' },
  { k: '친구', ru: 'друг' },
  { k: '학생', ru: 'ученик' },
  { k: '선생님', ru: 'учитель' },
  { k: '책', ru: 'книга' },
  { k: '커피', ru: 'кофе' },
  { k: '물', ru: 'вода' },
  { k: '밥', ru: 'еда, рис' },
  { k: '학교', ru: 'школа' },
  { k: '집', ru: 'дом' },
  { k: '카페', ru: 'кафе' },
  { k: '도서관', ru: 'библиотека' },
]

export interface LabParticle {
  id: string
  /** форма после согласной / после гласной; у частиц без пары одинаковые */
  c: string
  v: string
  ru: string
}
/** Только пройденные частицы. */
export const PARTICLES: LabParticle[] = [
  { id: 'topic', c: '은', v: '는', ru: 'тема: «а что касается…»' },
  { id: 'subj', c: '이', v: '가', ru: 'подлежащее: «кто / что именно»' },
  { id: 'obj', c: '을', v: '를', ru: 'прямое дополнение: «что»' },
  { id: 'to', c: '에', v: '에', ru: 'куда / где (место)' },
  { id: 'at', c: '에서', v: '에서', ru: 'где происходит действие' },
]

export interface AttachResult {
  /** слово с частицей */
  text: string
  particle: string
  /** объяснение выбора формы */
  why: string
}

/** Присоединяет частицу к слову по правилу 받침 (у 저 с 이/가 своя форма 제가). */
export function attach(noun: string, p: LabParticle): AttachResult {
  if (p.c === p.v) return { text: noun + p.c, particle: p.c, why: `у ${p.c} одна форма, 받침 не важна` }
  if (noun === '저' && p.id === 'subj') return { text: '제가', particle: '가', why: '저 + 가 даёт особую форму 제가 (запомнить как есть)' }
  const b = hasBatchim(noun)
  const particle = b ? p.c : p.v
  return { text: noun + particle, particle, why: b ? `есть 받침 → ${p.c}` : `нет 받침 → ${p.v}` }
}

export type VerbForm = 'present' | 'past' | 'neg'
export const VERB_FORMS: { id: VerbForm; label: string }[] = [
  { id: 'present', label: 'Сейчас' },
  { id: 'past', label: 'Прошедшее' },
  { id: 'neg', label: 'Не…' },
]

/** Глаголы для конструктора: только те, у которых есть все три формы в словаре. */
const VERB_KEYS = ['가다', '오다', '먹다', '마시다', '보다', '읽다', '공부하다', '사다', '자다', '만나다']
export const VERBS = VERB_KEYS.map(k => CONJUGATIONS.find(c => c.k === k && c.kind === 'verb')).filter((c): c is Conjugation => !!c)

/** Разбор формы глагола: основа и добавленное окончание (если формы не слились). */
export function verbStep(c: Conjugation, form: VerbForm) {
  const out = c[form]
  const stem = c.k.slice(0, -1)
  const formWord = form === 'neg' ? out.replace(/^안 /, '') : out
  const ending = formWord.startsWith(stem) ? formWord.slice(stem.length) : ''
  const how =
    form === 'neg'
      ? `안 + ${formWord}: отрицание «не» ставится перед глаголом`
      : ending
        ? `основа ${stem}- + ${ending}`
        : `основа ${stem}- и окончание слились: ${stem}- → ${formWord}`
  return { out, how }
}

export interface Built {
  sentence: string
  steps: string[]
}
/** Собирает «тема-слово + дополнение + глагол» и пошагово объясняет каждую часть. */
export function build(a: { noun: string; p: LabParticle }, b: { noun: string; p: LabParticle }, v: Conjugation, form: VerbForm): Built {
  const x = attach(a.noun, a.p)
  const y = attach(b.noun, b.p)
  const z = verbStep(v, form)
  return {
    sentence: `${x.text} ${y.text} ${z.out}.`,
    steps: [`${a.noun} + ${x.particle}: ${x.why}`, `${b.noun} + ${y.particle}: ${y.why}`, `${v.k} → ${z.out}: ${z.how}`],
  }
}
