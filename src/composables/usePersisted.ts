import { ref, watch, type Ref } from 'vue'

/** Ref, который переживает обновление страницы: значение лежит в sessionStorage (закрыл вкладку браузера — сбросилось). */
export function usePersisted<T>(key: string, fallback: T, valid: (v: unknown) => boolean = () => true): Ref<T> {
  const k = 'ui_' + key
  let start = fallback
  try {
    const raw = sessionStorage.getItem(k)
    if (raw !== null) {
      const v = JSON.parse(raw)
      if (valid(v)) start = v as T
    }
  } catch {
    /* хранилище недоступно: работает без запоминания */
  }
  const r = ref(start) as Ref<T>
  watch(r, v => {
    try {
      sessionStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* без запоминания */
    }
  })
  return r
}
