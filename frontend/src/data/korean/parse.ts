import { ADJECTIVES, VERBS } from './forms'
import { short } from './tasks'
import { D } from './words'

export type SegType = 'word' | 'verb' | 'particle' | 'ending' | 'num' | 'unknown'

/** Подпись типа части разбора на карточке («слово», «частица»…). */
export const SEG_LABEL: Record<SegType, string> = {
  word: 'слово',
  verb: 'глагол',
  particle: 'частица',
  ending: 'окончание',
  num: 'число',
  unknown: 'нет в словаре',
}

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
  type: 'word' | 'verb' | 'ending'
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
/**
 * Имена героев учебника и примеров: слово, чтение, русская форма. Они не в словаре, чтобы не попадать в вопросы «что значит слово?»,
 * но разбор предложения знает их (после имени идёт частица или 씨).
 */
const NAMES: [string, string, string][] = [
  ['안나', 'анна', 'Анна'], ['마리', 'мари', 'Мари'], ['크리스', 'кхырисы', 'Крис'], ['아야나', 'аяна', 'Аяна'], ['미라', 'мира', 'Мира'],
  ['테오', 'тхэо', 'Тео'], ['나나', 'нана', 'Нана'], ['소날', 'сонал', 'Сонал'], ['제니', 'чени', 'Дженни'], ['다니엘', 'таниэль', 'Даниэль'],
  ['에릭', 'эрик', 'Эрик'], ['유진', 'юджин', 'Юджин'], ['이유진', 'июджин', 'Ли Юджин'], ['하이', 'хаи', 'Хай'], ['엥흐', 'энхы', 'Энх'],
  ['민우', 'мину', 'Минву'], ['김민우', 'кимину', 'Ким Минву'], ['닛쿤', 'ниткхун', 'Ниткхун'], ['자밀라', 'чамилла', 'Джамила'],
]
/** Имя, которое совпадает со словом словаря: «마리» это Мари, а после числа счётное слово («두 마리»). */
const HOMONYM_NAMES: [string, string][] = [['마리', '미라']]
const FUNC: [string, string, string][] = [
  ['있어요', 'ись', 'есть, находится'],
  ['없어요', 'опсо', 'нет, отсутствует'],
  ['아니에요', 'аниеё', 'не является'],
  ['아니었어요', 'аниосоё', 'не был(а), не было'],
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
  ['시', 'си', 'час (при указании времени: 7시)'],
  ['마음', 'маым', 'сердце, душа, настроение'],
  ['중요', 'чунъё', 'важность'],
  ['필요', 'пхиръё', 'необходимость, нужда'],
  ['편안', 'пхёнан', 'спокойствие, удобство (от 편안하다)'],
  ['교수님', 'кёсуним', 'профессор (вежливо, 님 = почтительный суффикс)'],
  ['뭘', 'мволь', 'что (뭐 + 를, сокращённо)'],
  ['누가', 'нуга', 'кто (누구 + 가: кто делает)'],
  ...NAMES.map(([n, r, ru]) => [n, r, `имя (${ru})`] as [string, string, string]),
]
/** После числа «개» — счётное слово, а не «собака». */
const NUMBER_WORDS = new Set(['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '한', '두', '세', '네', '몇'])
const SINO = /^[일이삼사오육칠팔구십백천만]+$/
/**
 * Формы глаголов и прилагательных, которых нет в списках `forms.ts`: нужны только разбору предложений (в тренажёры не попадают).
 * Слово, чтение, перевод; в конце в скобках от какого слова образовано.
 */
const FORMS: [string, string, string][] = [
  ['맑아요', 'малгаё', 'ясный, чистый (о небе) (настоящее время, от 맑다)'],
  ['귀여워요', 'квиёвоё', 'милый (настоящее время, от 귀엽다)'],
  ['편안해요', 'пхёнанхэё', 'спокойный, удобный (настоящее время, от 편안하다)'],
  ['중요해요', 'чунъёхэё', 'важный (настоящее время, от 중요하다)'],
  ['필요해요', 'пхиръёхэё', 'нужный (настоящее время, от 필요하다)'],
  ['답답해', 'таптапхэ', 'тягостно, душно (неформально, от 답답하다)'],
  ['막혀요', 'макхёё', 'закрывается, застревает (настоящее время, от 막히다)'],
  ['느껴요', 'ныккёё', 'чувствовать (настоящее время, от 느끼다)'],
  ['느껴져요', 'ныккёджёё', 'чувствуется (настоящее время, от 느껴지다)'],
  ['나요', 'наё', 'возникает, появляется (настоящее время, от 나다: 화가 나요 «сержусь»)'],
  ['말해', 'мальхэ', 'говорить (неформально, от 말하다)'],
  ['가서', 'касо', 'пойдя, и потом (от 가다 + 아서)'],
  ['갈게요', 'калькеё', 'пойду (решение или обещание, от 가다 + ㄹ게요)'],
  ['금하지', 'кымхаджи', 'сдерживать (от 금하다, форма перед 못했어요)'],
  ['못했어요', 'мотхэссоё', 'не получилось (прошедшее время, от 못하다)'],
  ['좋은', 'чоын', 'хороший (форма перед существительным, от 좋다)'],
  ['좋을', 'чоыль', 'хороший (форма перед 거예요, от 좋다)'],
]
const FUNC_MAP = new Map<string, Entry>([
  ...FUNC.map(([k, r, gloss]) => [k, { k, r, gloss, type: 'word' } as Entry] as const),
  ...FORMS.map(([k, r, gloss]) => [k, { k, r, gloss, type: 'verb' } as Entry] as const),
  // «-(으)ㄹ 거예요»: само 거예요 одно и то же, а перед ним форма основы с ㄹ / 을 (см. futureBase)
  ['거예요', { k: '거예요', r: 'коеё', gloss: 'будущее время, планы («буду…»)', type: 'ending', explain: 'Основа глагола + ㄹ / 을 + 거예요: так говорят о планах и будущем; пишется 거예요, читается [꺼예요]', g: 'future_my' } as Entry] as const,
])

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
  P('에게서', 'эгэсо', 'от кого (только люди и животные)', 'ege'),
  P('한테서', 'хантхэсо', 'от кого (разговорный вариант)', 'ege'),
  P('에서', 'эсо', 'где происходит действие', 'eseo'),
  P('에게', 'эгэ', 'кому', 'ege'),
  P('한테', 'хантхэ', 'кому (разговорный вариант)', 'ege'),
  P('으로', 'ыро', 'чем, на чём, в какую сторону', 'ro', ['으로', '로']),
  P('하고', 'хаго', 'и (между существительными)', 'hago'),
  P('부터', 'пхото', 'начиная с'),
  P('까지', 'ккаджи', 'до'),
  P('이었어요', 'иосоё', 'был(а), было (прошедшее время связки)', 'past_i', ['이었어요', '였어요']),
  P('였어요', 'ёсоё', 'был(а), было (прошедшее время связки)', 'past_i', ['이었어요', '였어요']),
  P('이에요', 'иеё', 'быть, являться (вежливая связка)', 'iyo', ['이에요', '예요']),
  P('예요', 'её', 'быть, являться (вежливая связка)', 'iyo', ['이에요', '예요']),
  P('은', 'ын', 'частица темы («а что касается…»)', 'eun', ['은', '는']),
  P('는', 'нын', 'частица темы («а что касается…»)', 'eun', ['은', '는']),
  P('이', 'и', 'частица подлежащего («кто / что именно»)', 'iga', ['이', '가']),
  P('가', 'га', 'частица подлежащего («кто / что именно»)', 'iga', ['이', '가']),
  P('을', 'ыль', 'частица объекта («что» делают)', 'eul', ['을', '를']),
  P('를', 'рыль', 'частица объекта («что» делают)', 'eul', ['을', '를']),
  P('에', 'э', 'где находится или куда идут', 'iss'),
  P('도', 'то', 'тоже, и', 'too_do'),
  P('만', 'ман', 'только (выделяет одно и исключает остальное)', 'man'),
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
  const ending = ['이에요', '예요', '이었어요', '였어요'].includes(p.form)
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

/** Глаголы, у которых бывает форма «основа + ㄹ / 을» перед 거예요: глаголы из тренажёров и на -하다 (прилагательные не берём). */
const VERB_BASES = new Set<string>(
  [...VERBS.map(e => e.k), ...D.filter(w => w.k.endsWith('하다')).map(w => clean(w.k))].filter(k => !ADJECTIVES.some(a => a.k === k)),
)

/**
 * Слово «갈», «먹을», «할», «살»: форма перед 거예요. Возвращает глагол в словарной форме или null.
 * 을 после основы с 받침 (먹 + 을), ㄹ под последней гласной (가 + ㄹ = 갈), основа на ㄹ остаётся (살, 만들).
 */
function futureBase(tok: string): string | null {
  if (!tok) return null
  const head = tok.slice(0, -1)
  // существительное + 하다: «성공할», «운동할» (существительное есть в словаре)
  if (tok.length > 1 && tok.endsWith('할') && LEX.has(head)) return head + '하다'
  if (tok.endsWith('을') && VERB_BASES.has(head + '다')) return head + '다'
  const c = tok.charCodeAt(tok.length - 1) - 0xac00
  if (c < 0 || c > 11171 || c % 28 !== 8) return null
  const open = head + String.fromCharCode(0xac00 + c - 8) + '다'
  if (VERB_BASES.has(open)) return open
  return VERB_BASES.has(tok + '다') ? tok + '다' : null
}

/** Разбор одного слова (без пробелов). Возвращает null, если не получилось. */
function analyzeToken(tok: string, depth = 0): Segment[] | null {
  // «뭐예요», «어디예요»: связку показываем отдельно, даже если фраза есть в словаре целиком
  const cop = tok.match(/^(.+?)(이에요|예요|이었어요|였어요)$/)
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

  // «갈 거예요», «먹을 거예요»: основа + ㄹ / 을 (перед 거예요)
  const fb = futureBase(tok)
  if (fb) {
    const base = LEX.get(fb)?.gloss ?? fb
    return [{ text: tok, type: 'verb', gloss: `${base} (форма перед 거예요, от ${fb})`, explain: `${fb.slice(0, -1)} + ${tok.endsWith('을') ? '을' : 'ㄹ'} → ${tok}: основа с ㄹ / 을 перед 거예요`, g: 'future_my' }]
  }

  // «공부해요», «협력해요»: существительное + 하다 в настоящем времени
  if (tok.endsWith('해요') && tok.length > 2) {
    const stem = tok.slice(0, -2)
    const head = LEX.get(stem)
    // «미안해요»: в словаре слово лежит целиком как 미안하다 (глагол или прилагательное на -하다)
    const whole = head ? undefined : LEX.get(stem + '하다')
    if (whole) {
      return [{ ...entrySeg(tok, whole), explain: `${stem}하다 + 아요 → ${tok}: слова на -하다 всегда дают 해요` }]
    }
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

  // «저도요», «저는요»: вежливое 요 после частицы
  if (tok.length > 2 && tok.endsWith('요')) {
    const head = analyzeToken(tok.slice(0, -1), depth + 1)
    if (head && head[head.length - 1]!.type === 'particle') {
      return [...head, {
        text: '요',
        type: 'ending',
        reading: 'ё',
        gloss: 'вежливое окончание',
        explain: `Добавляется к короткому ответу и делает его вежливым: ${tok.slice(0, -1)} → ${tok} («${tok.slice(0, -1)}» неформально, «${tok}» вежливо)`,
      }]
    }
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

/** Слова времени из словаря: после них 에 отвечает на вопрос «когда?» (금요일에), а не «где?». */
const TIME_WORDS = new Set(D.filter(w => w.c.includes('время') && w.k !== '언제').map(w => clean(w.k)).filter(Boolean))
const TIME_PATTERN = /^(\d+(시|월|일|분)|오전|오후|새벽|낮|방학|휴일)$/
const MOTION_PATTERN = /(가요|갔어요|갑니다|가다|와요|왔어요|옵니다|오다)$/

/**
 * Частица 에 одна, а правил у неё три: время («금요일에» — когда), направление («학교에 가요» — куда) и место нахождения («집에 있어요» — где).
 * Карточку и подсказку выбираем по соседним словам, иначе у предложения про время была бы ссылка на «место».
 */
function refineE(segs: Segment[]): Segment[] {
  const motion = segs.some(x => x.type !== 'particle' && MOTION_PATTERN.test(x.text))
  return segs.map((x, i) => {
    if (x.type !== 'particle' || x.text !== '에') return x
    const prev = segs[i - 1]?.text ?? ''
    if (TIME_WORDS.has(prev) || TIME_PATTERN.test(prev)) {
      return { ...x, g: 'when_e', gloss: 'когда (частица времени)', explain: `«${prev}» отвечает на вопрос «когда?», поэтому к нему добавляется 에` }
    }
    if (motion) return { ...x, g: 'gada', gloss: 'куда (направление движения)', explain: `Глагол движения (идти, приходить): 에 показывает, куда` }
    return { ...x, g: 'iss', gloss: 'где находится', explain: `После слова места 에 вместе с 있다 / 없다 говорит, где что-то находится` }
  })
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
    // «마리 씨», «저는 마리예요»: имя, а не счётное слово (счётное только после числа)
    const hn = HOMONYM_NAMES.find(([n]) => tok.startsWith(n) && !NUMBER_WORDS.has(tokens[i - 1] ?? ''))
    if (hn) {
      const [n, stand] = hn
      const named = analyzeToken(stand + tok.slice(n.length))
      if (named) {
        const e = FUNC_MAP.get(n)!
        out.push({ ...named[0]!, text: n, reading: e.r, gloss: e.gloss }, ...named.slice(1))
        continue
      }
    }
    const segs = analyzeToken(tok)
    if (segs) out.push(...segs)
    else out.push({ text: tok, type: 'unknown', gloss: 'нет в словаре' })
  }
  return refineE(out)
}
