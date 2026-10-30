import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * Состояние страницы в адресе: `?имя=значение`. Значение по умолчанию в адрес не пишется.
 * Каждая смена — новая запись истории, поэтому «Назад» в браузере возвращает на прошлую вкладку, а после обновления страницы остаёмся на ней.
 */
export function useQueryParam<T extends string>(key: string, def: T, allowed: readonly T[]) {
  const route = useRoute()
  const router = useRouter()
  return computed<T>({
    get: () => {
      const v = route.query[key]
      return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def
    },
    set: v => {
      const { [key]: _old, ...rest } = route.query
      void router.push({ query: v === def ? rest : { ...rest, [key]: v } })
    },
  })
}
