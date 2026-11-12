import { computed, reactive, ref, type Ref } from 'vue'
import { hl } from '@/data/korean/render'
import { mergeSearchResults, resultFromSearchReply, search, searchRemote, type SearchResult } from '@/data/korean/search'
import { refTabs } from '@/data/korean/sections'
import { parseQuery } from '@/data/korean/words'

/** Сколько результатов группы видно до кнопки «ещё». */
const LIMIT = 6

/**
 * Общий поиск по платформе для окна поиска и главной раздела: локальный результат сразу, индекс дополняет его чуть позже.
 * Разметка у экранов разная (окно раскрывает на месте, главная ведёт на страницы), поэтому общая только логика.
 */
export function useSiteSearch(q: Ref<string>) {
  const result = ref<SearchResult | null>(search(q.value))
  let timer: ReturnType<typeof setTimeout> | undefined
  let request = 0
  const qs = computed(() => parseQuery(q.value))
  /** Подсветка найденного в тексте. */
  const h = (t: string) => hl(t, qs.value)

  const more = reactive<Record<string, boolean>>({})
  const take = <T,>(key: string, list: T[]) => (more[key] ? list : list.slice(0, LIMIT))
  const rest = (key: string, n: number) => (!more[key] && n > LIMIT ? n - LIMIT : 0)
  const chunkTabs = computed(() => refTabs.filter(t => result.value?.chunks[t.id]?.length))

  /** Новый запрос: локальный поиск сразу, через 180 мс ответ индекса (если запрос за это время не сменился). */
  function run(value: string) {
    result.value = search(value)
    clearTimeout(timer)
    const mine = ++request
    timer = setTimeout(() => {
      void searchRemote(value).then(remote => {
        // индекс только дополняет локальный поиск (опечатки), но не заменяет его
        if (mine === request && remote) result.value = mergeSearchResults(search(value), resultFromSearchReply(remote))
      })
    }, 180)
  }
  /** Экран закрывается: поздний ответ индекса больше не нужен. */
  function stop() {
    clearTimeout(timer)
    request++
  }
  return { result, h, more, take, rest, chunkTabs, run, stop }
}
