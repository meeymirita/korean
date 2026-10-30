import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import type { WordsCheckResult } from '@/components/korean/WordsCheck.vue'

/** Задание в снимке набора: вопрос, варианты, верный ответ и что выбрано (null, если не отвечено). */
export interface SnapTask {
  title: string
  prompt: string
  hint?: string
  options: string[]
  answer: string
  picked: string | null
  kind: string
}

/** Снимок набора «Сегодня»: всё, что было на странице в момент сохранения. */
export interface SetData {
  words: { k: string; r: string; t: string }[]
  rule: { id: string; ko: string; ru: string }
  ruleTasks: SnapTask[]
  tasks: SnapTask[]
  check: WordsCheckResult | null
}

export interface SavedSet {
  id: string
  day: string
  right: number
  total: number
  created: number
  data: SetData | null
}

/** Сохранённые наборы страницы «Сегодня»: хранятся на сервере, видны только владельцу. */
export const useTodaySetsStore = defineStore('todaySets', () => {
  const progress = useProgressStore()
  const items = ref<SavedSet[]>([])
  const loaded = ref(false)
  const headers = (json = false) => ({ Authorization: `Bearer ${progress.bearer}`, ...(json ? { 'Content-Type': 'application/json' } : {}) })

  const fail = (status: number) => new Error(status === 403 ? 'наборы сохраняются только у владельца' : status === 401 ? 'нужно войти по токену' : `ошибка сервера ${status}`)

  async function load() {
    const res = await fetchT('/api/sets', { headers: headers() })
    if (!res.ok) throw fail(res.status)
    items.value = ((await res.json()) as { items: SavedSet[] }).items
    loaded.value = true
  }

  async function save(day: string, right: number, total: number, data: SetData): Promise<SavedSet> {
    const res = await fetchT('/api/sets', { method: 'POST', headers: headers(true), body: JSON.stringify({ day, right, total, data }) })
    if (!res.ok) throw fail(res.status)
    const set = (await res.json()) as SavedSet
    items.value.unshift(set)
    return set
  }

  async function remove(id: string) {
    const res = await fetchT(`/api/sets/${id}`, { method: 'DELETE', headers: headers() })
    if (!res.ok && res.status !== 404) throw fail(res.status)
    items.value = items.value.filter(s => s.id !== id)
  }

  return { items, loaded, load, save, remove }
})
