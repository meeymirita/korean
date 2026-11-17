/**
 * Формат «материалов»: пачка присланных (тетради, учебник, задания Леры), которую владелец или Claude из десктопного приложения
 * отправляет одним запросом `POST /api/materials`. Здесь проверка пачки и описание формата для `GET /api/materials/format`.
 */
import { BadRequestException } from '@nestjs/common'

export const MAX_ITEMS = 200
export const MAX_BATCHES = 300
export const KINDS = ['workbook', 'textbook', 'notebook', 'lera', 'other'] as const
export const ITEM_TYPES = ['word', 'sentence', 'dialog', 'text', 'grammar', 'exercise', 'note'] as const
export type Kind = (typeof KINDS)[number]
export type ItemType = (typeof ITEM_TYPES)[number]

export interface Pair {
  ko: string
  ru: string
}
export type Item =
  | { type: 'word'; ko: string; reading: string; ru: string; example: string; note: string }
  | { type: 'sentence'; ko: string; ru: string; topic: string }
  | { type: 'dialog'; title: string; lines: Pair[] }
  | { type: 'text'; title: string; sentences: Pair[]; questions: { q: string; options: string[]; answer: number }[] }
  | { type: 'grammar'; title: string; note: string; examples: Pair[] }
  | { type: 'exercise'; prompt: string; body: string; answer: string }
  | { type: 'note'; text: string }

const bad = (error: string): never => {
  throw new BadRequestException({ error })
}

/** Строка нужной длины: обрезает пробелы; пустая допустима, только если `req` не задан. */
function str(v: unknown, field: string, max: number, req = false): string {
  if (v === undefined || v === null) v = ''
  if (typeof v !== 'string') return bad(`${field}: нужна строка`)
  const s = v.trim()
  if (s.length > max) return bad(`${field}: длиннее ${max}`)
  if (req && !s) return bad(`${field}: обязательно`)
  return s
}
const obj = (v: unknown, field: string): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : bad(`${field}: нужен объект`))
const arr = (v: unknown, field: string, min: number, max: number): unknown[] => {
  if (v === undefined || v === null) v = []
  if (!Array.isArray(v)) return bad(`${field}: нужен список`)
  if (v.length < min) return bad(`${field}: не меньше ${min}`)
  if (v.length > max) return bad(`${field}: не больше ${max}`)
  return v
}
const pairs = (v: unknown, field: string, min: number): Pair[] =>
  arr(v, field, min, 100).map((p, i) => {
    const o = obj(p, `${field}[${i}]`)
    return { ko: str(o.ko, `${field}[${i}].ko`, 400, true), ru: str(o.ru, `${field}[${i}].ru`, 400) }
  })

function cleanItem(raw: unknown, i: number): Item {
  const o = obj(raw, `items[${i}]`)
  const at = `items[${i}]`
  switch (o.type) {
    case 'word':
      return { type: 'word', ko: str(o.ko, `${at}.ko`, 60, true), reading: str(o.reading, `${at}.reading`, 80), ru: str(o.ru, `${at}.ru`, 120, true), example: str(o.example, `${at}.example`, 200), note: str(o.note, `${at}.note`, 3000) }
    case 'sentence':
      return { type: 'sentence', ko: str(o.ko, `${at}.ko`, 400, true), ru: str(o.ru, `${at}.ru`, 400), topic: str(o.topic, `${at}.topic`, 120) }
    case 'dialog':
      return { type: 'dialog', title: str(o.title, `${at}.title`, 120), lines: pairs(o.lines, `${at}.lines`, 2) }
    case 'text': {
      const questions = arr(o.questions, `${at}.questions`, 0, 30).map((q, j) => {
        const qo = obj(q, `${at}.questions[${j}]`)
        const options = arr(qo.options, `${at}.questions[${j}].options`, 2, 6).map((x, k) => str(x, `${at}.questions[${j}].options[${k}]`, 300, true))
        const answer = qo.answer
        if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return bad(`${at}.questions[${j}].answer: номер варианта с нуля`)
        return { q: str(qo.q, `${at}.questions[${j}].q`, 400, true), options, answer }
      })
      return { type: 'text', title: str(o.title, `${at}.title`, 120), sentences: pairs(o.sentences, `${at}.sentences`, 1), questions }
    }
    case 'grammar':
      return { type: 'grammar', title: str(o.title, `${at}.title`, 120, true), note: str(o.note, `${at}.note`, 3000), examples: o.examples === undefined ? [] : pairs(o.examples, `${at}.examples`, 0) }
    case 'exercise':
      return { type: 'exercise', prompt: str(o.prompt, `${at}.prompt`, 1000, true), body: str(o.body, `${at}.body`, 3000), answer: str(o.answer, `${at}.answer`, 1000) }
    case 'note':
      return { type: 'note', text: str(o.text, `${at}.text`, 3000, true) }
    default:
      return bad(`${at}.type: одно из ${ITEM_TYPES.join(', ')}`)
  }
}

/** Проверяет и нормализует пачку: источник, вид и список элементов; лишние поля отбрасываются. */
export function cleanMaterial(body: unknown): { source: string; kind: Kind; items: Item[] } {
  const b = obj(body, 'body')
  const kind = b.kind === undefined ? 'other' : b.kind
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) return bad(`kind: одно из ${KINDS.join(', ')}`)
  const items = arr(b.items, 'items', 1, MAX_ITEMS).map(cleanItem)
  return { source: str(b.source, 'source', 200, true), kind: kind as Kind, items }
}

/** Описание для `GET /api/materials/format` (открытый адрес, без секретов): по нему Claude из десктопного приложения узнаёт формат и маршруты. */
export const MATERIALS_FORMAT = {
  about:
    'Приём материалов для платформы 우리말: слова, предложения, диалоги, тексты, заметки по грамматике и задания из тетрадей, учебника и от Леры. Всё попадает во «Входящие» на странице «Слова», в словарь и грамматику ничего не вносится само: решает владелец.',
  auth: 'Authorization: Bearer <токен>. Токен с записью владелец создаёт кнопкой «Токен для Claude (запись)» на странице «Слова» → «Входящие»; живёт 10 минут, по нему можно только читать входящие и добавлять, править и удалять нельзя.',
  kinds: KINDS,
  itemTypes: {
    word: { required: ['ko', 'ru'], optional: ['reading', 'example', 'note'], limits: { ko: 60, reading: 80, ru: 120, example: 200, note: 3000 }, extra: 'слово дополнительно попадает в «Новые слова»' },
    sentence: { required: ['ko'], optional: ['ru', 'topic'] },
    dialog: { required: ['lines'], optional: ['title'], lines: 'список {ko, ru} не меньше двух' },
    text: { required: ['sentences'], optional: ['title', 'questions'], questions: 'список {q, options: [2–6 вариантов], answer: номер варианта с нуля}' },
    grammar: { required: ['title'], optional: ['note', 'examples'], examples: 'список {ko, ru}' },
    exercise: { required: ['prompt'], optional: ['body', 'answer'] },
    note: { required: ['text'] },
  },
  limits: { itemsPerRequest: MAX_ITEMS, batches: MAX_BATCHES, newWords: 500 },
  routes: [
    { method: 'GET', path: '/api/materials/format', auth: 'не нужен', desc: 'это описание' },
    { method: 'GET', path: '/api/public/rules', auth: 'не нужен', desc: 'правила проверки: что пройдено, что нельзя писать (с примерами), условия платформы; прочитай до отправки и проверь себя' },
    { method: 'POST', path: '/api/new-words', auth: 'токен с записью', desc: 'добавить одно слово во входящие: {ko, ru, reading?, example?, note?}' },
    { method: 'POST', path: '/api/materials', auth: 'токен с записью', desc: 'отправить пачку {source, kind?, items: [...]}' },
    { method: 'GET', path: '/api/new-words', auth: 'токен (чтение или запись)', desc: 'записанные слова' },
    { method: 'GET', path: '/api/materials', auth: 'токен (чтение или запись)', desc: 'присланные пачки, новые сверху' },
    { method: 'GET', path: '/api/learning', auth: 'токен (чтение или запись)', desc: 'краткая сводка: что пройдено, сколько слов выучено, как идёт учёба; прочитай её первой, чтобы не выходить за пройденное' },
  ],
  example: {
    source: 'Workbook 1A, Повторение 3, стр. 124–133',
    kind: 'workbook',
    items: [
      { type: 'word', ko: '갈비탕', reading: 'калбитхан', ru: 'суп с говяжьими рёбрами', example: '갈비탕이 맛있어요.' },
      { type: 'sentence', ko: '사과가 싸요.', ru: 'Яблоки дешёвые.', topic: '5 урок' },
      { type: 'dialog', title: 'Про еду', lines: [{ ko: '한국 음식을 좋아해요?', ru: 'Вы любите корейскую еду?' }, { ko: '네. 비빔밥이 맛있어요.', ru: 'Да. Бибимбап вкусный.' }] },
      { type: 'text', title: '나라식당', sentences: [{ ko: '저는 나라식당에 자주 가요.', ru: 'Я часто хожу в «Нара-сиктан».' }], questions: [{ q: 'Где находится ресторан?', options: ['рядом с домом', 'в школе'], answer: 0 }] },
      { type: 'grammar', title: '만', note: 'только', examples: [{ ko: '에릭 씨는 저 가수만 좋아해요.', ru: 'Эрик любит только того певца.' }] },
      { type: 'exercise', prompt: 'Вставь частицу: 방( ) 깨끗해요.', answer: '이' },
      { type: 'note', text: 'Лера просила повторить цены к субботе.' },
    ],
  },
} as const
