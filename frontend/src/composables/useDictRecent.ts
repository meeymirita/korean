import { ref } from 'vue'

/** «Недавно искал» большого словаря: хранится в браузере (у каждого посетителя своё), на сервер не уходит. */
export interface DictRecent { q: string; word: string; ru: string; pos: string }

const KEY = 'dict_recent'
const MAX = 12

export function useDictRecent() {
  const items = ref<DictRecent[]>([])

  /** только в браузере (onMounted) */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
      if (Array.isArray(raw)) items.value = raw.filter(r => r && typeof r.q === 'string' && typeof r.word === 'string').slice(0, MAX)
    } catch { /* без памяти браузера работает так же, просто без истории */ }
  }

  /** Новая запись всегда сверху, повтор того же запроса поднимается наверх. Читаем память заново: слово могли записать другая вкладка или другая страница. */
  function add(r: DictRecent) {
    load()
    items.value = [r, ...items.value.filter(x => x.q !== r.q && x.word !== r.word)].slice(0, MAX)
    try { localStorage.setItem(KEY, JSON.stringify(items.value)) } catch { /* не страшно */ }
  }

  function clear() {
    items.value = []
    try { localStorage.removeItem(KEY) } catch { /* не страшно */ }
  }

  return { items, load, add, clear }
}
