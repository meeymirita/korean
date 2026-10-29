import { ADJECTIVES, VERBS } from './forms'
import { short } from './tasks'
import { D } from './words'

export type SegType = 'word' | 'verb' | 'particle' | 'ending' | 'num' | 'unknown'

export interface Segment {
  text: string
  type: SegType
  reading?: string
  gloss: string
  /** пояснение для частиц и окончаний */
  explain?: string
  /** id карточки грамматики */
  g?: string
}

/** Названия нижних согласных (받침) по индексу из Unicode. */
const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ',
  'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

/** Индекс 받침 последней буквы (0 — нет), -1 если это не слог хангыля. */
const jongOf = (word: string) => {
  const c = word.charCodeAt(word.length - 1) - 0xac00
  return c < 0 || c > 11171 ? -1 : c % 28
}

const clean = (s: string) => s.replace(/[?!.,~…]/g, '').trim()

interface Entry {
  k: string
  r: string
  gloss: string
  type: 'word' | 'verb'
  explain?: string
  g?: string
}

/** Словарь для разбора: слова, формы глаголов и несколько служебных слов. */
const LEX = new Map<string, Entry>()
const add = (k: string, e: Entry) => {
  if (!LEX.has(k)) LEX.set(k, e)
}

for (const w of D) {
  const k = clean(w.k)
  if (!k || /[()]/.test(k)) continue
  add(k, { k, r: w.r, gloss: short(w.t), type: 'word' })
}
for (const [list, g] of [[VERBS, 'ayo'], [ADJECTIVES, 'adj']] as const) {
  for (const e of list) {
    const base = short(e.t)
    if (e.form) add(e.form, { k: e.form, r: '', gloss: `${base} (настоящее время, от ${e.k})`, type: 'verb', explain: e.s || undefined, g })
    if (e.past) add(e.past, { k: e.past, r: '', gloss: `${base} (прошедшее время, от ${e.k})`, type: 'verb', explain: e.s || undefined })
  }
}
const FUNC: [string, string, string][] = [
  ['있어요', 'ись', 'есть, находится'],
  ['없어요', 'опсо', 'нет, отсутствует'],
  ['아니에요', 'аниеё', 'не является'],
  ['주세요', 'чусеё', 'дайте, пожалуйста'],
  ['제', 'че', 'мой (вежливо)'],
  ['내', 'нэ', 'мой (неформально)'],
  ['이', 'и', 'этот'],
  ['그', 'кы', 'тот'],
  ['저', 'чо', 'вон тот'],
  ['씨', 'сси', 'обращение по имени (вежливо)'],
  ['어느', 'оны', 'какой'],
  ['꼭', 'ккок', 'обязательно'],
  ['내일', 'нэиль', 'завтра'],
  ['어제', 'оджэ', 'вчера'],
  ['한', 'хан', 'один (перед счётным словом)'],
  ['두', 'ту', 'два (перед счётным словом)'],
  ['세', 'сэ', 'три (перед счётным словом)'],
  ['네', 'не', 'четыре (перед счётным словом) / да'],
  ['명', 'мён', 'человек (счётное слово)'],
  ...['안나', '마리', '크리스', '아야나', '미라', '테오', '나나', '소날'].map(n => [n, '', 'имя'] as [string, string, string]),
]
/** После числа «개» — счётное слово, а не «собака». */
const NUMBER_WORDS = new Set(['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '한', '두', '세', '네', '몇'])
const SINO = /^[일이삼사오육칠팔구십백천만]+$/
const FUNC_MAP = new Map(FUNC.map(([k, r, gloss]) => [k, { k, r, gloss, type: 'word' } as Entry]))

interface Particle {
  form: string
  read: string
  gloss: string
  g?: string
  /** пара «после согласной / после гласной» */
  pair?: [string, string]
}

const P = (form: string, read: string, gloss: string, g?: string, pair?: [string, string]): Particle => ({
  form,
  read,
  gloss,
  g,
  pair,
})

/** Частицы и окончания, длинные раньше коротких. */
const PARTICLES: Particle[] = [
  P('에게서', 'эгэсо', 'от кого (только люди и животные)', 'egeseo'),
  P('한테서', 'хантхэсо', 'от кого (разговорный вариант)', 'egeseo'),
  P('에서', 'эсо', 'где происходит действие', 'eseo'),
  P('에게', 'эгэ', 'кому', 'ege'),
  P('한테', 'хантхэ', 'кому (разговорный вариант)', 'ege'),
  P('으로', 'ыро', 'чем, на чём, в какую сторону', 'ro', ['으로', '로']),
  P('하고', 'хаго', 'и (между существительными)', 'hago'),
  P('부터', 'пхото', 'начиная с'),
  P('까지', 'ккаджи', 'до'),
  P('이에요', 'иеё', 'быть, являться (вежливая связка)', 'iyo', ['이에요', '예요']),
  P('예요', 'её', 'быть, являться (вежливая связка)', 'iyo', ['이에요', '예요']),
  P('은', 'ын', 'частица темы («а что касается…»)', 'eun', ['은', '는']),
  P('는', 'нын', 'частица темы («а что касается…»)', 'eun', ['은', '는']),
  P('이', 'и', 'частица подлежащего («кто / что именно»)', 'iga', ['이', '가']),
  P('가', 'га', 'частица подлежащего («кто / что именно»)', 'iga', ['이', '가']),
  P('을', 'ыль', 'частица объекта («что» делают)', 'eul', ['을', '를']),
  P('를', 'рыль', 'частица объекта («что» делают)', 'eul', ['을', '를']),
  P('에', 'э', 'где находится или куда идут', 'iss'),
  P('도', 'то', 'тоже, и'),
  P('의', 'ы', 'принадлежность («чей»)'),
  P('로', 'ро', 'чем, на чём, в какую сторону', 'ro', ['으로', '로']),
  P('와', 'ва', 'и, вместе с', undefined, ['과', '와']),
  P('과', 'ква', 'и, вместе с', undefined, ['과', '와']),
  P('께', 'кке', 'кому (вежливо, старшим)', 'ege'),
  P('들', 'туль', 'показатель множественного числа', 'deul'),
]

/** Подходит ли частица к слову по 받침: «у слова есть 받침 → 은». */
function fits(p: Particle, stem: string) {
  if (!p.pair) return true
  const j = jongOf(stem)
  if (j < 0) return false
  const withJong = j !== 0
  // 로 ставится и после ㄹ
  const isRieul = j === 8
  const [a, b] = p.pair
  if (p.form === a) return a === '으로' ? withJong && !isRieul : withJong
  if (p.form === b) return b === '로' ? !withJong || isRieul : !withJong
  return true
}

function explainParticle(p: Particle, stem: string): string {
  const word = `«${stem}»`
  if (!p.pair) return p.gloss
  const j = jongOf(stem)
  const jn = JONG[j] ?? ''
  const [a, b] = p.pair
  if (p.form === '로' && j === 8) return `У слова ${word} 받침 ㄹ, поэтому после него ставится ${b} (не ${a})`
  if (p.form === a) return `У слова ${word} есть 받침${jn ? ` (${jn})` : ''} → ${a}`
  return `У слова ${word} нет 받침 → ${b}`
}

const entrySeg = (tok: string, e: Entry): Segment => ({
  text: tok,
  type: e.type,
  reading: e.r || undefined,
  gloss: e.gloss,
  explain: e.explain,
  g: e.g,
})

const particleSeg = (p: Particle, stem: string): Segment => {
  const ending = p.form === '이에요' || p.form === '예요'
  return {
    text: p.form,
    type: ending ? 'ending' : 'particle',
    reading: p.read,
    gloss: p.gloss,
    explain: explainParticle(p, stem),
    g: p.g,
  }
}

/** Слова из двух частей («스포츠 센터»): ищем их до разбиения по пробелам. */
const MULTI: [string, string, Entry][] = [...LEX.entries()]
  .filter(([k]) => k.includes(' '))
  .map(([k, e]) => [k.split(' ')[0]!, k.split(' ')[1]!, e])
/** Остаток после второй части — ровно одна частица или ничего. */
const fitsRest = (b: string, token: string) => {
  const rest = token.slice(b.length)
  return !rest || PARTICLES.some(p => p.form === rest)
}

/** Разбор одного слова (без пробелов). Возвращает null, если не получилось. */
function analyzeToken(tok: string, depth = 0): Segment[] | null {
  // «뭐예요», «어디예요»: связку показываем отдельно, даже если фраза есть в словаре целиком
  const cop = tok.match(/^(.+?)(이에요|예요)$/)
  if (cop) {
    const p = PARTICLES.find(x => x.form === cop[2])!
    if (fits(p, cop[1]!)) {
      const head = analyzeToken(cop[1]!, depth + 1)
      if (head) return [...head, particleSeg(p, cop[1]!)]
    }
  }
  const direct = LEX.get(tok) ?? FUNC_MAP.get(tok)
  if (direct) return [entrySeg(tok, direct)]
  if (depth > 2) return null
  if (SINO.test(tok)) return [{ text: tok, type: 'num', gloss: 'число (китайское)' }]

  // «공부해요», «협력해요»: существительное + 하다 в настоящем времени
  if (tok.endsWith('해요') && tok.length > 2) {
    const stem = tok.slice(0, -2)
    const head = LEX.get(stem)
    return [
      head ? entrySeg(stem, head) : { text: stem, type: 'unknown', gloss: 'нет в словаре' },
      {
        text: '해요',
        type: 'verb',
        reading: 'хэё',
        gloss: 'делать (настоящее время)',
        explain: '하다 + 아요 → 해요: глаголы на -하다 всегда дают 해요',
        g: 'ayo',
      },
    ]
  }

  const num = tok.match(/^(\d+)(.+)$/)
  if (num) {
    const rest = analyzeToken(num[2]!, depth + 1)
    if (rest) return [{ text: num[1]!, type: 'num', gloss: 'число', }, ...rest]
  }

  for (const p of PARTICLES) {
    if (tok.length <= p.form.length || !tok.endsWith(p.form)) continue
    const stem = tok.slice(0, -p.form.length)
    if (!fits(p, stem)) continue
    const head = analyzeToken(stem, depth + 1)
    if (!head) continue
    return [...head, particleSeg(p, stem)]
  }
  return null
}

/** Разбирает предложение на слова, частицы и окончания. */
export function analyze(sentence: string): Segment[] {
  const tokens = sentence.split(/\s+/).map(clean).filter(Boolean)
  const out: Segment[] = []
  for (let i = 0; i < tokens.length; i++) {
    const pair = tokens[i + 1] ? `${tokens[i]} ${tokens[i + 1]}` : ''
    const multi = pair ? LEX.get(pair) : undefined
    if (multi) {
      out.push(entrySeg(pair, multi))
      i++
      continue
    }
    const tok = tokens[i]!
    // слово из двух частей + частица: «스포츠 센터에»
    const multiPart = MULTI.find(([a, b]) => a === tok && tokens[i + 1]?.startsWith(b) && fitsRest(b, tokens[i + 1]!))
    if (multiPart) {
      const [a, b, entry] = multiPart
      const rest = tokens[i + 1]!.slice(b.length)
      out.push(entrySeg(`${a} ${b}`, entry))
      if (rest) out.push(particleSeg(PARTICLES.find(p => p.form === rest)!, `${a} ${b}`))
      i++
      continue
    }
    // «개» после числа — счётное слово
    if (tok === '개' && i > 0 && NUMBER_WORDS.has(tokens[i - 1]!)) {
      out.push({ text: '개', type: 'word', reading: 'кэ', gloss: 'штука (счётное слово)' })
      continue
    }
    // «이 / 그 / 저» перед существительным — указательные слова
    if (['이', '그', '저'].includes(tok) && tokens[i + 1]) {
      out.push(entrySeg(tok, FUNC_MAP.get(tok)!))
      continue
    }
    const segs = analyzeToken(tok)
    if (segs) out.push(...segs)
    else out.push({ text: tok, type: 'unknown', gloss: 'нет в словаре' })
  }
  return out
}
