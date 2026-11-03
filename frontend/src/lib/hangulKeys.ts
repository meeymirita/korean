/**
 * Корейская раскладка 두벌식 (стандартная): какими клавишами печатаются буквы и слоги.
 * Тренажёр слепой печати сверяет нажатия с последовательностью клавиш, а не с набранным текстом:
 * так он работает без корейского IME в системе (клавиши берутся по физическому коду `KeyboardEvent.code`).
 */

export interface Key {
  /** физическая клавиша: «KeyQ», «Space», «Period»… */
  code: string
  /** нужен ли Shift */
  shift: boolean
}

/** Буква → клавиша (латинская буква на раскладке QWERTY). Двойные ㅃ ㅉ ㄸ ㄲ ㅆ ㅒ ㅖ набираются с Shift. */
const BASE: Record<string, string> = {
  ㅂ: 'q', ㅈ: 'w', ㄷ: 'e', ㄱ: 'r', ㅅ: 't', ㅛ: 'y', ㅕ: 'u', ㅑ: 'i', ㅐ: 'o', ㅔ: 'p',
  ㅁ: 'a', ㄴ: 's', ㅇ: 'd', ㄹ: 'f', ㅎ: 'g', ㅗ: 'h', ㅓ: 'j', ㅏ: 'k', ㅣ: 'l',
  ㅋ: 'z', ㅌ: 'x', ㅊ: 'c', ㅍ: 'v', ㅠ: 'b', ㅜ: 'n', ㅡ: 'm',
}
const SHIFTED: Record<string, string> = { ㅃ: 'q', ㅉ: 'w', ㄸ: 'e', ㄲ: 'r', ㅆ: 't', ㅒ: 'o', ㅖ: 'p' }

/** Клавиши, у которых есть вариант с Shift: на остальных Shift ничего не меняет. */
export const SHIFTABLE = new Set(Object.values(SHIFTED))

/** Подписи для экранной клавиатуры: латинская буква → [обычная буква, буква с Shift]. */
export const KEY_LABELS: Record<string, [string, string | undefined]> = (() => {
  const out: Record<string, [string, string | undefined]> = {}
  for (const [j, k] of Object.entries(BASE)) out[k] = [j, undefined]
  for (const [j, k] of Object.entries(SHIFTED)) out[k]![1] = j
  return out
})()

/** Три ряда экранной клавиатуры. */
export const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map(r => r.split(''))

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('')
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.split('')
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'.split('')]

/** Составные гласные и конечные: набираются двумя клавишами подряд. */
const SPLIT: Record<string, string[]> = {
  ㅘ: ['ㅗ', 'ㅏ'], ㅙ: ['ㅗ', 'ㅐ'], ㅚ: ['ㅗ', 'ㅣ'], ㅝ: ['ㅜ', 'ㅓ'], ㅞ: ['ㅜ', 'ㅔ'], ㅟ: ['ㅜ', 'ㅣ'], ㅢ: ['ㅡ', 'ㅣ'],
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
}

/** Клавиша одной буквы (чамо). null, если буква не из таблицы. */
export function keyOfJamo(j: string): Key | null {
  if (BASE[j]) return { code: 'Key' + BASE[j]!.toUpperCase(), shift: false }
  if (SHIFTED[j]) return { code: 'Key' + SHIFTED[j]!.toUpperCase(), shift: true }
  return null
}

const PUNCT: Record<string, Key> = {
  ' ': { code: 'Space', shift: false },
  '.': { code: 'Period', shift: false },
  ',': { code: 'Comma', shift: false },
  '?': { code: 'Slash', shift: true },
  '!': { code: 'Digit1', shift: true },
}

const isSyllable = (c: string) => {
  const n = c.charCodeAt(0)
  return n >= 0xac00 && n <= 0xd7a3
}

/** Буквы слога по порядку: «값» → ㄱ ㅏ ㅂ ㅅ (после составных разложены). */
export function jamoOf(ch: string): string[] {
  if (!isSyllable(ch)) return [ch]
  const n = ch.charCodeAt(0) - 0xac00
  const i = INITIALS[Math.floor(n / 588)]!
  const m = MEDIALS[Math.floor((n % 588) / 28)]!
  const f = FINALS[n % 28]!
  return [i, ...(SPLIT[m] ?? [m]), ...(f ? (SPLIT[f] ?? [f]) : [])]
}

/** Клавиши одного символа (слога, отдельной буквы или знака). Пустой список: символ набрать нечем. */
export function keysOfChar(ch: string): Key[] {
  if (PUNCT[ch]) return [PUNCT[ch]!]
  const keys: Key[] = []
  for (const j of jamoOf(ch)) {
    const k = keyOfJamo(j)
    if (!k) return []
    keys.push(k)
  }
  return keys
}

/** Можно ли набрать весь текст (в нём только корейские буквы и простые знаки). */
export const isTypable = (text: string) => !!text && [...text].every(c => keysOfChar(c).length > 0)

/** Клавиши всего текста: для каждого символа его клавиши и индекс символа. */
export function keysOfText(text: string): { key: Key; at: number }[] {
  const out: { key: Key; at: number }[] = []
  ;[...text].forEach((ch, at) => keysOfChar(ch).forEach(key => out.push({ key, at })))
  return out
}

/** Совпадает ли нажатие с ожидаемой клавишей: Shift учитывается только там, где он что-то меняет. */
export function matches(expected: Key, pressed: { code: string; shiftKey: boolean }): boolean {
  if (expected.code !== pressed.code) return false
  const letter = expected.code.startsWith('Key') ? expected.code.slice(3).toLowerCase() : ''
  const shiftMatters = expected.shift || SHIFTABLE.has(letter) || !expected.code.startsWith('Key')
  return !shiftMatters || expected.shift === pressed.shiftKey
}
