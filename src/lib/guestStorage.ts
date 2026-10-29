/**
 * Гостевой режим: пока он включён, всё, что сайт пишет в localStorage (прогресс, статистика игры, рекорды),
 * остаётся в памяти и пропадает вместе со страницей. Настоящее хранилище не трогается: данные владельца на этом
 * устройстве целы. Исключение — ключи входа: по ним гость остаётся в системе после перезагрузки.
 */
const KEEP = new Set(['progress_token', 'progress_verified', 'progress_role'])

let original: PropertyDescriptor | undefined
let active = false

export const guestStorageOn = () => active

export function enableGuestStorage() {
  if (active) return
  let real: Storage | null = null
  try {
    real = window.localStorage
  } catch {
    /* хранилище недоступно: тогда в памяти всё, включая вход */
  }
  const mem = new Map<string, string>()
  const kept = (k: string) => real !== null && KEEP.has(k)
  const shim = {
    getItem: (k: string) => (kept(k) ? real!.getItem(k) : (mem.get(k) ?? null)),
    setItem: (k: string, v: string) => void (kept(k) ? real!.setItem(k, v) : mem.set(k, String(v))),
    removeItem: (k: string) => void (kept(k) ? real!.removeItem(k) : mem.delete(k)),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  }
  original = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true, writable: true })
  active = true
}

export function disableGuestStorage() {
  if (!active) return
  if (original) Object.defineProperty(window, 'localStorage', original)
  else delete (window as { localStorage?: unknown }).localStorage
  original = undefined
  active = false
}
