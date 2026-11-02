/**
 * Оформление: светлое, тёмное или «как в системе». Выбор помнится в localStorage, на <html> ставится data-theme="light|dark".
 * Тёмные цвета лежат в assets/dark.css, они включаются только по этому атрибуту.
 */
import { ref } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'
export const THEME_KEY = 'theme_mode'
export const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'auto', label: 'Как в системе' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
]

export const isMode = (v: unknown): v is ThemeMode => v === 'auto' || v === 'light' || v === 'dark'

/** Какая тема на самом деле: «авто» зависит от системной настройки. */
export const resolveTheme = (mode: ThemeMode, systemDark: boolean): 'light' | 'dark' => (mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode)

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return isMode(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

/** Текущий выбор (общий для всех страниц). */
export const themeMode = ref<ThemeMode>(readMode())
/** Сейчас включена тёмная тема (для значка кнопки). */
export const themeDark = ref(false)

export function applyTheme() {
  if (typeof document === 'undefined') return
  const t = resolveTheme(themeMode.value, systemDark())
  document.documentElement.dataset.theme = t
  themeDark.value = t === 'dark'
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#14152b' : '#fbf8ff')
}

export function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* хранилище недоступно: тема действует до обновления страницы */
  }
  applyTheme()
}

/** Быстрая кнопка: светлая → тёмная → светлая (из «авто» переключает на противоположную текущей). */
export function toggleTheme() {
  const now = resolveTheme(themeMode.value, systemDark())
  setTheme(now === 'dark' ? 'light' : 'dark')
}

/** Вызывается один раз при запуске: ставит тему и следит за системной настройкой, пока выбрано «авто». */
export function initTheme() {
  applyTheme()
  if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => themeMode.value === 'auto' && applyTheme())
}
