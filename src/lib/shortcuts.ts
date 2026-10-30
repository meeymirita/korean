/**
 * Сочетания клавиш для пунктов меню и вкладок кабинета.
 * Сочетание = «модификатор» (⌘ на Mac или Ctrl) + одна клавиша, как у поиска (⌘K); можно добавить Alt и Shift.
 * Хранится строкой в каноническом порядке: «mod+alt+shift+KeyG» (код клавиши `KeyboardEvent.code`, не зависит от раскладки).
 */
export type Combo = string

interface KeyEventLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const MODIFIER_CODES = /^(Control|Meta|Alt|Shift|OS)(Left|Right)?$/

/** Занято самим сайтом: сюда ничего назначать нельзя (в списке настроек показывается замком). */
export const RESERVED_COMBOS: Record<Combo, string> = {
  'mod+KeyK': 'Поиск по платформе',
}

/** Занятое без модификатора: не конфликтует с сочетаниями, но показывается в списке, чтобы было понятно, что тут трогать не нужно. */
export const RESERVED_KEYS: { keys: string; what: string }[] = [
  { keys: '⌘K / Ctrl+K и «/»', what: 'Поиск по платформе' },
  { keys: 'F', what: 'Спрятать или показать боковое меню' },
  { keys: 'Esc', what: 'Закрыть окно' },
  { keys: '1–4 и Enter', what: 'Ответ и «Дальше» в заданиях' },
]

/** Эти сочетания забирает браузер раньше страницы: перехватить их нельзя. */
const BROWSER_KEYS = ['KeyT', 'KeyN', 'KeyW', 'KeyQ', 'Tab', 'PageUp', 'PageDown', ...Array.from({ length: 10 }, (_, i) => `Digit${i}`)]
const BROWSER = new Set<Combo>(BROWSER_KEYS.flatMap(k => [`mod+${k}`, `mod+shift+${k}`]))

const COMBO = /^mod(\+alt)?(\+shift)?\+[A-Za-z0-9]+$/

export const isCombo = (v: unknown): v is Combo => typeof v === 'string' && COMBO.test(v)

/** Сочетание из нажатия. null, если нет ⌘/Ctrl или нажаты одни модификаторы. */
export function comboFromEvent(e: KeyEventLike): Combo | null {
  if (!(e.ctrlKey || e.metaKey) || !e.code || MODIFIER_CODES.test(e.code)) return null
  return ['mod', e.altKey ? 'alt' : '', e.shiftKey ? 'shift' : '', e.code].filter(Boolean).join('+')
}

const KEY_NAMES: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Пробел', Enter: 'Enter', Backspace: '⌫',
}

function keyName(code: string) {
  return KEY_NAMES[code] ?? code.replace(/^(Key|Digit|Numpad)/, '')
}

/** «⌘⇧G» на Mac, «Ctrl+Shift+G» на остальных. */
export function comboLabel(combo: Combo, mac: boolean): string {
  const parts = combo.split('+')
  const code = parts[parts.length - 1]!
  const mods = parts.slice(0, -1)
  if (mac) return (mods.includes('mod') ? '⌘' : '') + (mods.includes('alt') ? '⌥' : '') + (mods.includes('shift') ? '⇧' : '') + keyName(code)
  return [mods.includes('mod') ? 'Ctrl' : '', mods.includes('alt') ? 'Alt' : '', mods.includes('shift') ? 'Shift' : '', keyName(code)].filter(Boolean).join('+')
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/**
 * Можно ли назначить сочетание пункту `id`. Возвращает текст ошибки или null.
 * `bindings`: id → сочетание; `labels`: id → название пункта (для подсказки «уже занято»).
 */
export function checkCombo(combo: Combo, id: string, bindings: Record<string, Combo>, labels: Record<string, string>): string | null {
  if (!isCombo(combo)) return 'Нужно ⌘/Ctrl и ещё одна клавиша.'
  if (RESERVED_COMBOS[combo]) return `Занято: ${RESERVED_COMBOS[combo]!.toLowerCase()}, его менять нельзя.`
  if (BROWSER.has(combo)) return 'Это сочетание забирает браузер, выбери другое.'
  const other = Object.keys(bindings).find(k => k !== id && bindings[k] === combo)
  if (other) return `Уже занято: «${labels[other] ?? other}».`
  return null
}

/** Из сохранённого в localStorage оставляет только исправные сочетания известных пунктов, без повторов. */
export function cleanBindings(raw: unknown, known: readonly string[]): Record<string, Combo> {
  const out: Record<string, Combo> = {}
  if (!raw || typeof raw !== 'object') return out
  const seen = new Set<Combo>()
  for (const id of known) {
    const v = (raw as Record<string, unknown>)[id]
    if (isCombo(v) && !RESERVED_COMBOS[v] && !BROWSER.has(v) && !seen.has(v)) {
      out[id] = v
      seen.add(v)
    }
  }
  return out
}
