/**
 * Генератор предложений для режима «Собери предложение».
 * Уровни: 1 — простой (2 слова), 2 — средний (3–4 слова), 3 — сложный (5–7 слов).
 * Предложения собираются из шаблонов: корейский и русский текст строятся из одних и тех же слов,
 * частицы выбираются по правилу 받침.
 */

export type Level = 1 | 2 | 3
/** 'p' — настоящее, 'a' — прошедшее, 'b' — любое */
export type TenseMode = 'p' | 'a' | 'b'

interface Chunk {
  t: string[]
  /** чанки одной группы можно переставлять; группы идут по возрастанию */
  g: number
}

export interface Built {
  level: Level
  key: string
  ru: string
  tiles: string[]
  right: string
  accept: string[]
  note: string
  /** предложение без пробелов в нужных местах — для разбора */
  sentence: string
}

/* ---------- случайность с зерном: одно и то же предложение можно повторить ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------- хангыль ---------- */
const jong = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return c < 0 || c > 11171 ? 0 : c % 28
}
const hasB = (w: string) => jong(w) !== 0
const topic = (w: string) => w + (hasB(w) ? '은' : '는')
const subj = (w: string) => w + (hasB(w) ? '이' : '가')
const obj = (w: string) => w + (hasB(w) ? '을' : '를')
const cop = (w: string) => w + (hasB(w) ? '이에요' : '예요')
/** Неверный вариант частицы (нарушает правило 받침) — для лишних плиток. */
const wrongTopic = (w: string) => w + (hasB(w) ? '는' : '은')
const wrongSubj = (w: string) => w + (hasB(w) ? '가' : '이')
const wrongObj = (w: string) => w + (hasB(w) ? '를' : '을')
const wrongCop = (w: string) => w + (hasB(w) ? '예요' : '이에요')

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* ---------- данные ---------- */
interface Person {
  ko: string
  ru: string
  /** m / f / n (для «я») */
  g: 'm' | 'f' | 'n'
}
const PEOPLE: Person[] = [
  { ko: '저', ru: 'я', g: 'n' },
  { ko: '엄마', ru: 'мама', g: 'f' },
  { ko: '아빠', ru: 'папа', g: 'm' },
  { ko: '친구', ru: 'друг', g: 'm' },
  { ko: '동생', ru: 'младший брат', g: 'm' },
  { ko: '선생님', ru: 'учитель', g: 'm' },
  { ko: '형', ru: 'старший брат', g: 'm' },
  { ko: '할머니', ru: 'бабушка', g: 'f' },
  { ko: '할아버지', ru: 'дедушка', g: 'm' },
  { ko: '누나', ru: 'старшая сестра', g: 'f' },
]
const THIRD = PEOPLE.slice(1)
/** «с кем» (творительный) */
const WITH: Record<string, string> = {
  친구: 'с другом',
  엄마: 'с мамой',
  선생님: 'с учителем',
  동생: 'с младшим братом',
  할머니: 'с бабушкой',
  형: 'со старшим братом',
}

interface Place {
  ko: string
  to: string
  at: string
}
const PLACES: Record<string, Place> = {
  공원: { ko: '공원', to: 'в парк', at: 'в парке' },
  학교: { ko: '학교', to: 'в школу', at: 'в школе' },
  집: { ko: '집', to: 'домой', at: 'дома' },
  도서관: { ko: '도서관', to: 'в библиотеку', at: 'в библиотеке' },
  시장: { ko: '시장', to: 'на рынок', at: 'на рынке' },
  카페: { ko: '카페', to: 'в кафе', at: 'в кафе' },
  백화점: { ko: '백화점', to: 'в универмаг', at: 'в универмаге' },
  병원: { ko: '병원', to: 'в больницу', at: 'в больнице' },
  식당: { ko: '식당', to: 'в ресторан', at: 'в ресторане' },
  은행: { ko: '은행', to: 'в банк', at: 'в банке' },
  우체국: { ko: '우체국', to: 'на почту', at: 'на почте' },
  서점: { ko: '서점', to: 'в книжный магазин', at: 'в книжном магазине' },
  영화관: { ko: '영화관', to: 'в кинотеатр', at: 'в кинотеатре' },
  마트: { ko: '마트', to: 'в супермаркет', at: 'в супермаркете' },
  회사: { ko: '회사', to: 'на работу', at: 'в компании' },
  부엌: { ko: '부엌', to: 'на кухню', at: 'на кухне' },
  방: { ko: '방', to: 'в комнату', at: 'в комнате' },
  바다: { ko: '바다', to: 'на море', at: 'на море' },
  체육관: { ko: '체육관', to: 'в спортзал', at: 'в спортзале' },
  빵집: { ko: '빵집', to: 'в пекарню', at: 'в пекарне' },
  교실: { ko: '교실', to: 'в класс', at: 'в классе' },
  냉장고: { ko: '냉장고', to: 'в холодильник', at: 'в холодильнике' },
  가방: { ko: '가방', to: 'в сумку', at: 'в сумке' },
}
const place = (k: string) => PLACES[k]!

interface Time {
  ko: string
  ru: string
  t: 'p' | 'a'
  hab?: boolean
}
const TIMES: Time[] = [
  { ko: '오늘', ru: 'Сегодня', t: 'p' },
  { ko: '지금', ru: 'Сейчас', t: 'p' },
  { ko: '매일', ru: 'Каждый день', t: 'p', hab: true },
  { ko: '내일', ru: 'Завтра', t: 'p' },
  { ko: '아침에', ru: 'Утром', t: 'p' },
  { ko: '저녁에', ru: 'Вечером', t: 'p' },
  { ko: '어제', ru: 'Вчера', t: 'a' },
  { ko: '어제', ru: 'Вчера', t: 'a' },
  { ko: '아침에', ru: 'Утром', t: 'a' },
  { ko: '저녁에', ru: 'Вечером', t: 'a' },
]

/** Формы глагола: корейские и русские (я / он-она / прошедшее). */
interface Verb {
  p: string
  a: string
  r1: string
  r3: string
  /** привычное действие («хожу» вместо «иду») */
  h1?: string
  h3?: string
  pm: string
  pf: string
  pn: string
  presOnly?: boolean
}
const V = (p: string, a: string, r1: string, r3: string, pm: string, pf: string, pn: string, extra: Partial<Verb> = {}): Verb => ({
  p, a, r1, r3, pm, pf, pn, ...extra,
})

const GO = V('가요', '갔어요', 'иду', 'идёт', 'ходил', 'ходила', 'ходил(а)', { h1: 'хожу', h3: 'ходит' })
const COME = V('와요', '왔어요', 'прихожу', 'приходит', 'пришёл', 'пришла', 'пришёл(ла)')

/** Действия «где»: глагол + подходящие места (에서). */
const DO_AT: [Verb, string[]][] = [
  [V('공부해요', '공부했어요', 'занимаюсь', 'занимается', 'занимался', 'занималась', 'занимался(ась)'), ['도서관', '학교', '카페', '집', '방']],
  [V('일해요', '일했어요', 'работаю', 'работает', 'работал', 'работала', 'работал(а)'), ['회사', '카페', '은행', '식당']],
  [V('운동해요', '운동했어요', 'занимаюсь спортом', 'занимается спортом', 'занимался спортом', 'занималась спортом', 'занимался(ась) спортом'), ['공원', '체육관']],
  [V('쉬어요', '쉬었어요', 'отдыхаю', 'отдыхает', 'отдыхал', 'отдыхала', 'отдыхал(а)'), ['집', '카페', '공원', '방']],
  [V('산책해요', '산책했어요', 'гуляю', 'гуляет', 'гулял', 'гуляла', 'гулял(а)'), ['공원', '바다']],
  [V('놀아요', '놀았어요', 'играю', 'играет', 'играл', 'играла', 'играл(а)'), ['공원', '집', '방']],
]

interface Thing {
  ko: string
  acc: string
  /** где это обычно делают */
  at: string[]
}
interface Trans {
  v: Verb
  things: Thing[]
}
const T_ = (ko: string, acc: string, at: string[]): Thing => ({ ko, acc, at })

const TRANS: Trans[] = [
  {
    v: V('먹어요', '먹었어요', 'ем', 'ест', 'ел', 'ела', 'ел(а)'),
    things: [
      T_('사과', 'яблоко', ['집', '식당', '공원']),
      T_('빵', 'хлеб', ['집', '식당', '카페']),
      T_('밥', 'рис', ['집', '식당', '학교']),
      T_('피자', 'пиццу', ['집', '식당']),
      T_('햄버거', 'гамбургер', ['식당', '집']),
      T_('김치', 'кимчи', ['집', '식당']),
      T_('라면', 'рамен', ['집', '식당']),
      T_('샌드위치', 'сэндвич', ['카페', '공원', '집']),
      T_('케이크', 'торт', ['카페', '집']),
    ],
  },
  {
    v: V('마셔요', '마셨어요', 'пью', 'пьёт', 'пил', 'пила', 'пил(а)'),
    things: [
      T_('물', 'воду', ['집', '학교', '공원']),
      T_('커피', 'кофе', ['카페', '집', '도서관']),
      T_('주스', 'сок', ['카페', '집']),
      T_('우유', 'молоко', ['집', '학교']),
      T_('차', 'чай', ['카페', '집']),
      T_('맥주', 'пиво', ['식당', '집']),
    ],
  },
  {
    v: V('사요', '샀어요', 'покупаю', 'покупает', 'покупал', 'покупала', 'покупал(а)'),
    things: [
      T_('빵', 'хлеб', ['빵집', '마트']),
      T_('우유', 'молоко', ['마트', '시장']),
      T_('사과', 'яблоки', ['시장', '마트']),
      T_('과일', 'фрукты', ['시장', '마트']),
      T_('책', 'книгу', ['서점']),
      T_('옷', 'одежду', ['백화점']),
      T_('가방', 'сумку', ['백화점']),
      T_('신발', 'обувь', ['백화점']),
      T_('선물', 'подарок', ['백화점', '시장']),
    ],
  },
  {
    v: V('읽어요', '읽었어요', 'читаю', 'читает', 'читал', 'читала', 'читал(а)'),
    things: [T_('책', 'книгу', ['도서관', '집', '카페']), T_('신문', 'газету', ['집', '카페', '도서관']), T_('편지', 'письмо', ['집', '방'])],
  },
  {
    v: V('써요', '썼어요', 'пишу', 'пишет', 'писал', 'писала', 'писал(а)'),
    things: [T_('편지', 'письмо', ['집', '방', '도서관']), T_('일기', 'дневник', ['집', '방', '카페'])],
  },
  {
    v: V('봐요', '봤어요', 'смотрю', 'смотрит', 'смотрел', 'смотрела', 'смотрел(а)'),
    things: [T_('영화', 'фильм', ['영화관', '집', '방']), T_('텔레비전', 'телевизор', ['집', '방']), T_('사진', 'фото', ['집', '방'])],
  },
  {
    v: V('들어요', '들었어요', 'слушаю', 'слушает', 'слушал', 'слушала', 'слушал(а)'),
    things: [T_('음악', 'музыку', ['집', '방', '카페', '공원']), T_('노래', 'песню', ['집', '방', '공원']), T_('라디오', 'радио', ['집', '방'])],
  },
  {
    v: V('만들어요', '만들었어요', 'делаю', 'делает', 'делал', 'делала', 'делал(а)'),
    things: [T_('빵', 'хлеб', ['집', '부엌']), T_('케이크', 'торт', ['집', '부엌']), T_('샌드위치', 'сэндвич', ['집', '부엌'])],
  },
  {
    v: V('청소해요', '청소했어요', 'убираю', 'убирает', 'убирал', 'убирала', 'убирал(а)'),
    things: [T_('방', 'комнату', []), T_('부엌', 'кухню', []), T_('집', 'дом', [])],
  },
  {
    v: V('배워요', '배웠어요', 'изучаю', 'изучает', 'изучал', 'изучала', 'изучал(а)'),
    things: [T_('한국어', 'корейский', ['학교', '도서관', '집'])],
  },
  {
    v: V('좋아해요', '좋아했어요', 'люблю', 'любит', 'любил', 'любила', 'любил(а)', { presOnly: true }),
    things: [T_('커피', 'кофе', []), T_('영화', 'кино', []), T_('음악', 'музыку', []), T_('여행', 'путешествия', []), T_('야구', 'бейсбол', []), T_('요리', 'готовить', [])],
  },
]

/** Пары для «А и Б» (하고) с подходящими глаголами и местами. */
interface Pair {
  v: string
  a: Thing
  b: Thing
  at: string[]
}
const PAIRS: Pair[] = [
  { v: '먹어요', a: T_('빵', 'хлеб', []), b: T_('사과', 'яблоко', []), at: ['집', '식당'] },
  { v: '먹어요', a: T_('김치', 'кимчи', []), b: T_('밥', 'рис', []), at: ['집', '식당'] },
  { v: '먹어요', a: T_('피자', 'пиццу', []), b: T_('햄버거', 'гамбургер', []), at: ['식당'] },
  { v: '마셔요', a: T_('물', 'воду', []), b: T_('주스', 'сок', []), at: ['집', '카페'] },
  { v: '마셔요', a: T_('차', 'чай', []), b: T_('커피', 'кофе', []), at: ['카페', '집'] },
  { v: '사요', a: T_('빵', 'хлеб', []), b: T_('우유', 'молоко', []), at: ['마트'] },
  { v: '사요', a: T_('사과', 'яблоки', []), b: T_('과일', 'фрукты', []), at: ['시장'] },
  { v: '사요', a: T_('옷', 'одежду', []), b: T_('신발', 'обувь', []), at: ['백화점'] },
  { v: '사요', a: T_('책', 'книгу', []), b: T_('신문', 'газету', []), at: ['서점'] },
]

const PROFESSIONS: [string, string][] = [
  ['학생', 'ученик'], ['선생님', 'учитель'], ['의사', 'врач'], ['가수', 'певец'], ['요리사', 'повар'],
  ['회사원', 'работник компании'], ['경찰', 'полицейский'], ['기자', 'журналист'], ['배우', 'актёр'],
]

interface Adj {
  n: string
  a: string
  past: string
  ru: string
  /** «был / была / было» */
  was: string
  ruAdj: string
}
const ADJS: Adj[] = [
  { n: '공원', a: '예뻐요', past: '예뻤어요', ru: 'Парк', was: 'был', ruAdj: 'красивый' },
  { n: '산', a: '높아요', past: '높았어요', ru: 'Гора', was: 'была', ruAdj: 'высокая' },
  { n: '바다', a: '커요', past: '컸어요', ru: 'Море', was: 'было', ruAdj: 'большое' },
  { n: '의자', a: '작아요', past: '작았어요', ru: 'Стул', was: 'был', ruAdj: 'маленький' },
  { n: '빵', a: '맛있어요', past: '맛있었어요', ru: 'Хлеб', was: 'был', ruAdj: 'вкусный' },
  { n: '사과', a: '비싸요', past: '비쌌어요', ru: 'Яблоки', was: 'были', ruAdj: 'дорогие' },
  { n: '커피', a: '싸요', past: '쌌어요', ru: 'Кофе', was: 'был', ruAdj: 'дешёвый' },
  { n: '선생님', a: '친절해요', past: '친절했어요', ru: 'Учитель', was: 'был', ruAdj: 'приветливый' },
  { n: '영화', a: '재미있어요', past: '재미있었어요', ru: 'Фильм', was: 'был', ruAdj: 'интересный' },
  { n: '버스', a: '느려요', past: '느렸어요', ru: 'Автобус', was: 'был', ruAdj: 'медленный' },
  { n: '날씨', a: '좋아요', past: '좋았어요', ru: 'Погода', was: 'была', ruAdj: 'хорошая' },
]
/** «В классе чисто» — безличные. */
const ADJS_AT: Adj[] = [
  { n: '교실', a: '깨끗해요', past: '깨끗했어요', ru: 'В классе', was: 'было', ruAdj: 'чисто' },
  { n: '도서관', a: '조용해요', past: '조용했어요', ru: 'В библиотеке', was: 'было', ruAdj: 'тихо' },
  { n: '방', a: '따뜻해요', past: '따뜻했어요', ru: 'В комнате', was: 'было', ruAdj: 'тепло' },
]
const ADVERBS: [string, string][] = [['아주', 'очень'], ['너무', 'слишком'], ['정말', 'очень']]

interface Exist {
  ko: string
  nom: string
  gen: string
  at: string[]
}
const EXIST: Exist[] = [
  { ko: '고양이', nom: 'кошка', gen: 'кошки', at: ['집', '방'] },
  { ko: '침대', nom: 'кровать', gen: 'кровати', at: ['방', '집'] },
  { ko: '컴퓨터', nom: 'компьютер', gen: 'компьютера', at: ['방', '교실', '회사'] },
  { ko: '텔레비전', nom: 'телевизор', gen: 'телевизора', at: ['방', '집'] },
  { ko: '책', nom: 'книга', gen: 'книги', at: ['가방', '도서관'] },
  { ko: '우산', nom: 'зонт', gen: 'зонта', at: ['가방'] },
  { ko: '열쇠', nom: 'ключ', gen: 'ключа', at: ['가방'] },
  { ko: '우유', nom: 'молоко', gen: 'молока', at: ['냉장고'] },
  { ko: '사과', nom: 'яблоки', gen: 'яблок', at: ['냉장고'] },
  { ko: '학생', nom: 'ученик', gen: 'ученика', at: ['교실', '학교'] },
  { ko: '선생님', nom: 'учитель', gen: 'учителя', at: ['교실', '학교', '도서관'] },
]
const EXIST_PAIRS: [Exist, Exist, string][] = [
  [EXIST[1]!, { ko: '의자', nom: 'стул', gen: 'стула', at: [] }, '방'],
  [{ ko: '책상', nom: 'стол', gen: 'стола', at: [] }, { ko: '의자', nom: 'стул', gen: 'стула', at: [] }, '교실'],
  [EXIST[9]!, EXIST[10]!, '교실'],
  [EXIST[7]!, { ko: '물', nom: 'вода', gen: 'воды', at: [] }, '냉장고'],
  [EXIST[4]!, EXIST[5]!, '가방'],
  [EXIST[2]!, { ko: '책상', nom: 'стол', gen: 'стола', at: [] }, '방'],
]

interface Item {
  ko: string
  c: string
  /** винительный: «одну / две / три / четыре / пять» + единица */
  unit: [string, string, string]
  of: string
  fem: boolean
}
const ITEMS: Item[] = [
  { ko: '커피', c: '잔', unit: ['чашку', 'чашки', 'чашек'], of: 'кофе', fem: true },
  { ko: '물', c: '병', unit: ['бутылку', 'бутылки', 'бутылок'], of: 'воды', fem: true },
  { ko: '콜라', c: '병', unit: ['бутылку', 'бутылки', 'бутылок'], of: 'колы', fem: true },
  { ko: '비빔밥', c: '그릇', unit: ['миску', 'миски', 'мисок'], of: 'бибимбапа', fem: true },
  { ko: '빵', c: '개', unit: ['булку', 'булки', 'булок'], of: '', fem: true },
  { ko: '사과', c: '개', unit: ['яблоко', 'яблока', 'яблок'], of: '', fem: false },
]
const NUMS: [string, string, string, string][] = [
  ['한', 'одну', 'одно', ''],
  ['두', 'две', 'два', ''],
  ['세', 'три', 'три', ''],
  ['네', 'четыре', 'четыре', ''],
  ['다섯', 'пять', 'пять', ''],
]
function ruCount(it: Item, n: number): string {
  const num = NUMS[n - 1]!
  const word = it.fem ? num[1] : num[2]
  const unit = n === 1 ? it.unit[0] : n <= 4 ? it.unit[1] : it.unit[2]
  return [word, unit, it.of].filter(Boolean).join(' ')
}

/* ---------- сборка ---------- */
type Rng = () => number
const mk = (rng: Rng) => ({
  pick: <T,>(a: T[]): T => a[Math.floor(rng() * a.length)]!,
  shuffle: <T,>(a: T[]): T[] => {
    const r = a.slice()
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[r[i], r[j]] = [r[j]!, r[i]!]
    }
    return r
  },
  chance: (p: number) => rng() < p,
})

const sentenceEnd = (s: string) => cap(s.replace(/\s+/g, ' ').trim()) + '.'

/** Русский глагол по подлежащему и времени. */
function ruVerb(v: Verb, who: Person | null, past: boolean, hab = false): string {
  if (past) return who?.g === 'f' ? v.pf : who?.g === 'm' ? v.pm : v.pn
  const third = who && who.ko !== '저'
  if (hab && v.h1) return third ? v.h3! : v.h1
  return third ? v.r3 : v.r1
}

/** Допустимые порядки: перестановки внутри групп. */
function orders(chunks: Chunk[]): string[][] {
  const groups = new Map<number, Chunk[]>()
  for (const c of chunks) groups.set(c.g, [...(groups.get(c.g) ?? []), c])
  const perms = <T,>(a: T[]): T[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])))
  let seqs: string[][] = [[]]
  for (const g of [...groups.keys()].sort((a, b) => a - b)) {
    const opts = perms(groups.get(g)!).map(p => p.flatMap(c => c.t))
    seqs = seqs.flatMap(s => opts.map(o => [...s, ...o]))
  }
  return seqs
}

interface Draft {
  chunks: Chunk[]
  ru: string
  note: string
  /** лишние плитки */
  extra: string[]
}

const ORDER = 'Порядок слов: время → кто → с кем → где → что → глагол.'

type Tpl = (r: ReturnType<typeof mk>, tense: 'p' | 'a') => Draft

/* ===== Простой уровень ===== */
const simple: Tpl[] = [
  // Куда иду
  (r, tense) => {
    const pl = place(r.pick(['공원', '학교', '집', '도서관', '시장', '카페', '병원', '식당', '은행', '우체국', '서점', '영화관', '마트', '회사']))
    const v = r.chance(0.8) ? GO : COME
    const past = tense === 'a'
    return {
      chunks: [{ t: [pl.ko + '에'], g: 0 }, { t: [past ? v.a : v.p], g: 9 }],
      ru: sentenceEnd(`${ruVerb(v, null, past)} ${pl.to}`),
      note: 'Куда идём → 에: место + 에 + 가요 / 와요.',
      extra: [r.pick([past ? v.p : v.a, pl.ko + '에서'])],
    }
  },
  // Что делаю
  (r, tense) => {
    const tr = r.pick(TRANS)
    const th = r.pick(tr.things)
    const past = tense === 'a' && !tr.v.presOnly
    return {
      chunks: [{ t: [obj(th.ko)], g: 0 }, { t: [past ? tr.v.a : tr.v.p], g: 9 }],
      ru: sentenceEnd(`${ruVerb(tr.v, null, past)} ${th.acc}`),
      note: 'Что делаем → 을/를: после 받침 ставится 을, без 받침 — 를.',
      extra: [r.pick([wrongObj(th.ko), past ? tr.v.p : tr.v.a])],
    }
  },
  // Кто есть кто
  r => {
    const s = r.pick(PEOPLE)
    const [pro, ru] = r.pick(PROFESSIONS)
    return {
      chunks: [{ t: [topic(s.ko)], g: 0 }, { t: [cop(pro)], g: 9 }],
      ru: sentenceEnd(`${s.ru} — ${ru}`),
      note: 'Связка: после 받침 — 이에요, без 받침 — 예요.',
      extra: [r.pick([wrongCop(pro), wrongTopic(s.ko)])],
    }
  },
  // Какой предмет
  (r, tense) => {
    const a = r.pick(ADJS)
    const past = tense === 'a'
    return {
      chunks: [{ t: [subj(a.n)], g: 0 }, { t: [past ? a.past : a.a], g: 9 }],
      ru: sentenceEnd(`${a.ru} ${past ? a.was + ' ' : ''}${a.ruAdj}`),
      note: 'Подлежащее → 이/가: после 받침 — 이, без 받침 — 가.',
      extra: [r.pick([wrongSubj(a.n), past ? a.a : a.past])],
    }
  },
]

/* ===== Средний уровень ===== */
function pickTime(r: ReturnType<typeof mk>, tense: 'p' | 'a', only?: string[]): Time {
  const list = TIMES.filter(t => t.t === tense && (!only || only.includes(t.ko)))
  return r.pick(list.length ? list : TIMES.filter(t => t.t === tense))
}

const medium: Tpl[] = [
  // Завтра иду в парк
  (r, tense) => {
    const t = pickTime(r, tense)
    const pl = place(r.pick(['공원', '학교', '도서관', '시장', '카페', '병원', '식당', '은행', '서점', '영화관', '마트', '백화점']))
    const v = r.chance(0.8) ? GO : COME
    const past = tense === 'a'
    return {
      chunks: [{ t: [t.ko], g: 0 }, { t: [pl.ko + '에'], g: 1 }, { t: [past ? v.a : v.p], g: 9 }],
      ru: sentenceEnd(`${t.ru} ${ruVerb(v, null, past, t.hab)} ${pl.to}`),
      note: 'Время ставится в начало. Куда идём → 에. ' + ORDER,
      extra: [r.pick([pl.ko + '에서', past ? v.p : v.a])],
    }
  },
  // Кто что делает
  (r, tense) => {
    const tr = r.pick(TRANS)
    const th = r.pick(tr.things)
    const s = r.pick(PEOPLE)
    const past = tense === 'a' && !tr.v.presOnly
    return {
      chunks: [{ t: [topic(s.ko)], g: 0 }, { t: [obj(th.ko)], g: 1 }, { t: [past ? tr.v.a : tr.v.p], g: 9 }],
      ru: sentenceEnd(`${s.ru} ${ruVerb(tr.v, s, past)} ${th.acc}`),
      note: 'Кто → 은/는, что → 을/를. ' + ORDER,
      extra: [r.pick([wrongObj(th.ko), wrongTopic(s.ko)])],
    }
  },
  // Кто где что-то делает
  (r, tense) => {
    const [v, places] = r.pick(DO_AT)
    const pl = place(r.pick(places))
    const s = r.pick(PEOPLE)
    const past = tense === 'a'
    return {
      chunks: [{ t: [topic(s.ko)], g: 0 }, { t: [pl.ko + '에서'], g: 1 }, { t: [past ? v.a : v.p], g: 9 }],
      ru: sentenceEnd(`${s.ru} ${ruVerb(v, s, past)} ${pl.at}`),
      note: 'Где происходит действие → 에서 (а 에 — для «куда» и «где находится»).',
      extra: [r.pick([pl.ko + '에', past ? v.p : v.a])],
    }
  },
  // Где что есть
  r => {
    const e = r.pick(EXIST)
    const pl = place(r.pick(e.at))
    const has = r.chance(0.7)
    return {
      chunks: [{ t: [pl.ko + '에'], g: 0 }, { t: [subj(e.ko)], g: 0 }, { t: [has ? '있어요' : '없어요'], g: 9 }],
      ru: sentenceEnd(has ? `${cap(pl.at)} есть ${e.nom}` : `${cap(pl.at)} нет ${e.gen}`),
      note: 'Место + 에, предмет + 이/가, затем 있어요 (есть) или 없어요 (нет).',
      extra: [r.pick([has ? '없어요' : '있어요', wrongSubj(e.ko)])],
    }
  },
  // Очень красивый
  (r, tense) => {
    const a = r.pick(ADJS)
    const [adv, ru] = r.pick(ADVERBS)
    const past = tense === 'a'
    return {
      chunks: [{ t: [subj(a.n)], g: 0 }, { t: [adv], g: 1 }, { t: [past ? a.past : a.a], g: 9 }],
      ru: sentenceEnd(`${a.ru} ${past ? a.was + ' ' : ''}${ru} ${a.ruAdj}`),
      note: 'Наречие (아주, 너무, 정말) стоит перед прилагательным.',
      extra: [r.pick([past ? a.a : a.past, r.pick(ADVERBS.map(x => x[0]).filter(x => x !== adv))])],
    }
  },
  // Закажи
  r => {
    const it = r.pick(ITEMS)
    const n = r.pick([1, 2, 3, 4, 5])
    const num = NUMS[n - 1]!
    return {
      chunks: [{ t: [it.ko], g: 0 }, { t: [num[0]], g: 1 }, { t: [it.c], g: 2 }, { t: ['주세요'], g: 9 }],
      ru: sentenceEnd(`${cap(ruCount(it, n))}, пожалуйста`),
      note: 'Заказ: предмет + число + счётное слово + 주세요. Перед счётным словом 하나/둘/셋/넷 сокращаются: 한, 두, 세, 네.',
      extra: [r.pick(['개', '명', '병', '잔', '그릇'].filter(x => x !== it.c))],
    }
  },
  // Мой друг — врач
  r => {
    const rel = r.pick(['친구', '동생', '형'])
    const [pro, ru] = r.pick(PROFESSIONS)
    const relRu = rel === '친구' ? 'друг' : rel === '동생' ? 'младший брат' : 'старший брат'
    return {
      chunks: [{ t: ['제'], g: 0 }, { t: [topic(rel)], g: 1 }, { t: [cop(pro)], g: 9 }],
      ru: sentenceEnd(`Мой ${relRu} — ${ru}`),
      note: '제 — «мой» (вежливо): ставится перед существительным.',
      extra: [r.pick([wrongCop(pro), '내'])],
    }
  },
  // Кто где находится
  r => {
    const s = r.pick(PEOPLE)
    const pl = place(r.pick(['집', '학교', '부엌', '방', '도서관', '회사', '카페', '교실']))
    return {
      chunks: [{ t: [topic(s.ko)], g: 0 }, { t: [pl.ko + '에'], g: 1 }, { t: ['있어요'], g: 9 }],
      ru: sentenceEnd(`${s.ru === 'я' ? 'Я' : cap(s.ru)} ${pl.at}`),
      note: 'Где находится → 에 + 있어요.',
      extra: [r.pick([pl.ko + '에서', '없어요'])],
    }
  },
]

/* ===== Сложный уровень ===== */
const hard: Tpl[] = [
  // Время, кто, где, А и Б, глагол
  (r, tense) => {
    const p = r.pick(PAIRS)
    const tr = TRANS.find(t => t.v.p === p.v)!
    const t = pickTime(r, tense)
    const s = r.pick(PEOPLE)
    const pl = place(r.pick(p.at))
    const past = tense === 'a'
    return {
      chunks: [
        { t: [t.ko], g: 0 }, { t: [topic(s.ko)], g: 0 },
        { t: [pl.ko + '에서'], g: 1 }, { t: [p.a.ko + '하고'], g: 2 }, { t: [obj(p.b.ko)], g: 3 },
        { t: [past ? tr.v.a : tr.v.p], g: 9 },
      ],
      ru: sentenceEnd(`${t.ru} ${s.ru} ${ruVerb(tr.v, s, past, t.hab)} ${p.a.acc} и ${p.b.acc} ${pl.at}`),
      note: 'А하고 В을/를 — «А и В»: частица ставится один раз, после последнего слова. ' + ORDER,
      extra: [wrongObj(p.b.ko), pl.ko + '에'],
    }
  },
  // Время, кто, с кем, куда
  (r, tense) => {
    const t = pickTime(r, tense)
    const s = r.pick(PEOPLE.filter(x => x.ko === '저' || x.ko === '엄마' || x.ko === '아빠' || x.ko === '동생'))
    const w = r.pick(Object.keys(WITH).filter(k => k !== s.ko))
    const pl = place(r.pick(['공원', '학교', '도서관', '시장', '카페', '영화관', '백화점', '식당']))
    const v = GO
    const past = tense === 'a'
    return {
      chunks: [
        { t: [t.ko], g: 0 }, { t: [topic(s.ko)], g: 0 },
        { t: [w + '하고'], g: 1 }, { t: [pl.ko + '에'], g: 1 },
        { t: [past ? v.a : v.p], g: 9 },
      ],
      ru: sentenceEnd(`${t.ru} ${s.ru} ${ruVerb(v, s, past, t.hab)} ${pl.to} ${WITH[w]}`),
      note: '친구하고 — «с другом»: 하고 ставится после слова. ' + ORDER,
      extra: [wrongTopic(s.ko), pl.ko + '에서'],
    }
  },
  // Сейчас в классе есть А и Б
  r => {
    const [a, b, pk] = r.pick(EXIST_PAIRS)
    const pl = place(pk)
    const t = pickTime(r, 'p', ['지금', '오늘'])
    const has = r.chance(0.75)
    return {
      chunks: [
        { t: [t.ko], g: 0 }, { t: [pl.ko + '에'], g: 1 },
        { t: [a.ko + '하고'], g: 2 }, { t: [subj(b.ko)], g: 3 }, { t: [has ? '있어요' : '없어요'], g: 9 },
      ],
      ru: sentenceEnd(has ? `${t.ru} ${pl.at} есть ${a.nom} и ${b.nom}` : `${t.ru} ${pl.at} нет ${a.gen} и ${b.gen}`),
      note: 'Место + 에, затем А하고 В이/가 + 있어요 / 없어요.',
      extra: [wrongSubj(b.ko), has ? '없어요' : '있어요'],
    }
  },
  // Дайте А и Б
  r => {
    const [a, b] = r.shuffle(ITEMS.filter((x, i, arr) => arr.findIndex(y => y.ko === x.ko) === i)).slice(0, 2) as [Item, Item]
    const n1 = r.pick([1, 2, 3])
    const n2 = r.pick([1, 2, 3, 4, 5])
    return {
      chunks: [
        { t: [a.ko], g: 0 }, { t: [NUMS[n1 - 1]![0]], g: 1 }, { t: [a.c + '하고'], g: 2 },
        { t: [b.ko], g: 3 }, { t: [NUMS[n2 - 1]![0]], g: 4 }, { t: [b.c], g: 5 }, { t: ['주세요'], g: 9 },
      ],
      ru: sentenceEnd(`Дайте ${ruCount(a, n1)} и ${ruCount(b, n2)}, пожалуйста`),
      note: 'Заказ с «и»: предмет + число + счётное слово + 하고, затем второй предмет.',
      extra: [r.pick(['개', '명', '병', '잔', '그릇'].filter(x => x !== a.c && x !== b.c)), '세'],
    }
  },
  // Не делаю (안)
  (r, tense) => {
    const tr = r.pick(TRANS.filter(t => !t.v.presOnly))
    const th = r.pick(tr.things)
    const s = r.pick(PEOPLE)
    const t = pickTime(r, tense)
    const past = tense === 'a'
    const ruV = ruVerb(tr.v, s, past, t.hab)
    return {
      chunks: [{ t: [t.ko], g: 0 }, { t: [topic(s.ko)], g: 0 }, { t: [obj(th.ko)], g: 1 }, { t: ['안', past ? tr.v.a : tr.v.p], g: 9 }],
      ru: sentenceEnd(`${t.ru} ${s.ru} не ${ruV} ${th.acc}`),
      note: 'Отрицание: 안 ставится прямо перед глаголом. ' + ORDER,
      extra: [wrongObj(th.ko), past ? tr.v.p : tr.v.a],
    }
  },
  // Время, кто, где, что, глагол
  (r, tense) => {
    const tr = r.pick(TRANS.filter(t => t.things.some(x => x.at.length)))
    const th = r.pick(tr.things.filter(x => x.at.length))
    const pl = place(r.pick(th.at))
    const t = pickTime(r, tense)
    const s = r.pick(PEOPLE)
    const past = tense === 'a' && !tr.v.presOnly
    return {
      chunks: [
        { t: [t.ko], g: 0 }, { t: [topic(s.ko)], g: 0 },
        { t: [pl.ko + '에서'], g: 1 }, { t: [obj(th.ko)], g: 1 },
        { t: [past ? tr.v.a : tr.v.p], g: 9 },
      ],
      ru: sentenceEnd(`${t.ru} ${s.ru} ${ruVerb(tr.v, s, past, t.hab)} ${th.acc} ${pl.at}`),
      note: ORDER + ' Где происходит действие → 에서.',
      extra: [pl.ko + '에', wrongObj(th.ko)],
    }
  },
]

const LEVELS: Record<Level, Tpl[]> = { 1: simple, 2: medium, 3: hard }

/** Собирает предложение: одно и то же зерно всегда даёт одно и то же предложение. */
export function makeBuild(level: Level, mode: TenseMode, seed: number): Built {
  const rng = mulberry32(seed)
  const r = mk(rng)
  const tense: 'p' | 'a' = mode === 'b' ? (r.chance(level === 1 ? 0.7 : 0.5) ? 'p' : 'a') : mode
  const tpl = r.pick(LEVELS[level])
  const d = tpl(r, tense)

  const accept = orders(d.chunks)
  const right = accept[0]!
  const flat = new Set(right)
  const extra = d.extra.filter((x, i, a) => !flat.has(x) && a.indexOf(x) === i).slice(0, level === 3 ? 2 : 1)
  const tiles = r.shuffle([...right, ...extra])
  return {
    level,
    key: `b:${level}:${mode}:${seed}`,
    ru: d.ru,
    tiles,
    right: right.join(' '),
    accept: accept.map(a => a.join(' ')),
    note: d.note,
    sentence: right.join(' '),
  }
}

/** Разбирает ключ вопроса, чтобы повторить пропущенное предложение. */
export function parseBuildKey(key: string): { level: Level; mode: TenseMode; seed: number } | null {
  const m = key.match(/^b:([123]):([pab]):(\d+)$/)
  return m ? { level: Number(m[1]) as Level, mode: m[2] as TenseMode, seed: Number(m[3]) } : null
}
