import { SECS, firstBlock, type Gram } from '@/data/korean/grammar'

/** Цвета разделов в видах «Книжная полка», «Колонки» и «Что хочешь сказать?» (по порядку `SECS`). */
export const SEC_PAL = ['#e879b9', '#8f7cf0', '#5db7e8', '#f4a261', '#5fc08f', '#ef6f8a', '#c9a24a', '#6a7be8', '#3fb8ad', '#b377e0', '#8a94b8']

export const secColor = (g: { s: string }) => SEC_PAL[Math.max(0, SECS.indexOf(g.s)) % SEC_PAL.length]!

/** Текст без цветных меток `{o|…}`, жирного и тегов. */
export const plain = (s: string) => s.replace(/\{[a-z]\|([^}]*)\}/g, '$1').replace(/\*\*/g, '').replace(/<br>/g, ' ').replace(/<[^>]+>/g, '')

/** Первое слово названия без дефисов и тильд: «아요 / 어요» → «아요». */
export const headKo = (g: { ko: string }) => plain(g.ko).split(/\s*[/+(]\s*/)[0]!.replace(/[~\-–]/g, '') || plain(g.ko)

const CYR = /[А-Яа-яЁё]/

/** Надпись на корешке: главная часть названия без русских пояснений, не длиннее 8 знаков (дальше «…»). Полное название идёт в подсказку. */
export function spineLabel(g: { ko: string }): string {
  const main = plain(g.ko)
    .replace(/\s*\([^)]*[А-Яа-яЁё][^)]*\)/g, '')
    .replace(new RegExp(`${CYR.source}+`, 'g'), '')
    .split(/\s*[/→~+]\s*/)[0]!
    .replace(/^\s*[-–]\s*/, '')
    .replace(/[\s:;,.·]+$/, '')
    .trim()
  const label = main || headKo(g)
  const ch = [...label]
  return ch.length > 8 ? `${ch.slice(0, 7).join('')}…` : label
}

/** Размер корешка: высота по длине надписи, ширина по объёму карточки; случайности нет (одно и то же на сервере и в браузере). */
export function spineSize(g: Gram): { h: number; w: number } {
  let n = 0
  for (const ch of g.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  const label = [...spineLabel(g)].length
  return { h: Math.max(84 + (n % 30), label * 14 + 34), w: 28 + Math.min(16, g.b.length) }
}

export const formulaOf = (g: Gram) => firstBlock(g.b, 'formula') ?? ''
export const ruleOf = (g: Gram) => firstBlock(g.b, 'rule') ?? firstBlock(g.b, 'p') ?? g.d

export interface Shelf {
  key: string
  label: string
  cards: Gram[]
}

/** Полки: своя карточка и книга 1A стоят на одной полке (как во вкладке «Мои карточки»), книга 1B на отдельной; пустые полки не показываем. Порядок внутри полки сохраняется как пришёл. */
export function shelvesOf(cards: Gram[], firstLabel: string): Shelf[] {
  return [
    { key: 'mine', label: firstLabel, cards: cards.filter(g => !g.bk?.startsWith('1B ')) },
    { key: '1B', label: 'Книга 1B', cards: cards.filter(g => g.bk?.startsWith('1B ')) },
  ].filter(s => s.cards.length)
}

/** Список в сохранённом порядке: сначала то, что есть в `saved`, остальное в прежнем порядке после него. */
export function orderBy(cards: Gram[], saved: string[] | undefined): Gram[] {
  if (!saved?.length) return cards
  const pos = new Map(saved.map((id, i) => [id, i]))
  return cards.map((g, i) => [g, pos.has(g.id) ? pos.get(g.id)! : 1e6 + i] as const).sort((x, y) => x[1] - y[1]).map(x => x[0])
}

/** Переставить `id` до или после `overId`. */
export function moveId(ids: string[], id: string, overId: string, after: boolean): string[] {
  const a = ids.filter(x => x !== id)
  const i = a.indexOf(overId)
  if (i < 0) return ids
  a.splice(after ? i + 1 : i, 0, id)
  return a
}

/** «Что ты хочешь сказать?»: раздел словами задачи. */
export const INTENT: Record<string, string> = {
  'Быть и отрицание': 'Представиться, назвать, сказать «это не…»',
  'Частицы': 'Связать слова: кто, что, о чём',
  'Место и направление': 'Сказать, где что находится и куда иду',
  'Глаголы и просьбы': 'Рассказать, что делаю, или о чём-то попросить',
  'Указатели и вопросы': 'Показать «это / то» и задать вопрос',
  'Вежливость': 'Быть вежливым',
  'Произношение': 'Правильно прочитать вслух',
  'Числительные': 'Посчитать, назвать цену и количество',
  'Время': 'Сказать когда: час, день, прошлое, будущее',
  'Желание и предложение': 'Сказать «хочу» или предложить «давай»',
  'Связки': 'Соединить две мысли в одну',
}
