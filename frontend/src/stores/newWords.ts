import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { errText, fetchT } from '@/lib/http'

export interface NewWord {
  id: string
  ko: string
  reading: string
  ru: string
  example: string
  note: string
  created: number
}
export type NewWordInput = Omit<NewWord, 'id' | 'created'>

/** Те же лимиты, что на сервере (backend/src/newwords). */
export const NEW_WORD_MAX = { ko: 60, reading: 80, ru: 120, example: 200, note: 3000 } as const

/** Слова, которые владелец записал в форме и которые ещё не внесены в словарь (вкладка «Не добавленные»). Гостю ничего не грузится. */
export const useNewWordsStore = defineStore('newWords', () => {
  const progress = useProgressStore()
  const items = ref<NewWord[]>([])
  const loaded = ref(false)

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })

  async function call(path: string, init: RequestInit = {}) {
    let res: Response
    try {
      res = await fetchT(`/api/new-words${path}`, { ...init, headers: headers() })
    } catch (e) {
      throw new Error(errText(e))
    }
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `ошибка ${res.status}`)
    return res.json()
  }

  async function load() {
    if (!progress.unlocked) return
    items.value = ((await call('')) as { words: NewWord[] }).words
    loaded.value = true
  }
  async function add(w: NewWordInput) {
    items.value = [(await call('', { method: 'POST', body: JSON.stringify(w) })) as NewWord, ...items.value]
  }
  async function update(id: string, w: NewWordInput) {
    const row = (await call(`/${id}`, { method: 'PUT', body: JSON.stringify(w) })) as NewWord
    items.value = items.value.map(i => (i.id === id ? row : i))
  }
  async function remove(id: string) {
    await call(`/${id}`, { method: 'DELETE' })
    items.value = items.value.filter(i => i.id !== id)
  }

  /** Временный токен (10 минут) только на чтение списка: владелец отдаёт его Claude. Показывается один раз. */
  async function createToken() {
    return (await call('/token', { method: 'POST' })) as { token: string; expires: number }
  }
  async function revokeToken() {
    await call('/token', { method: 'DELETE' })
  }

  return { items, loaded, load, add, update, remove, createToken, revokeToken }
})
