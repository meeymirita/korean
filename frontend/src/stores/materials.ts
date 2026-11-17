import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { errText, fetchT } from '@/lib/http'

export interface Pair {
  ko: string
  ru: string
}
export type MaterialItem =
  | { type: 'word'; ko: string; reading: string; ru: string; example: string; note: string }
  | { type: 'sentence'; ko: string; ru: string; topic: string }
  | { type: 'dialog'; title: string; lines: Pair[] }
  | { type: 'text'; title: string; sentences: Pair[]; questions: { q: string; options: string[]; answer: number }[] }
  | { type: 'grammar'; title: string; note: string; examples: Pair[] }
  | { type: 'exercise'; prompt: string; body: string; answer: string }
  | { type: 'task'; title: string; body: string; topic: string }
  | { type: 'mistake'; no: string; mine: string; right: string; why: string; topic: string }
  | { type: 'note'; text: string }

export interface MaterialBatch {
  id: string
  source: string
  kind: string
  status: 'new' | 'done'
  created: number
  items: MaterialItem[]
}

/** Описание формата и маршрутов приёма (открытый `GET /api/materials/format`): то же читает Claude из десктопного приложения. */
export interface MaterialsFormat {
  about: string
  auth: string
  routes: { method: string; path: string; auth: string; desc: string }[]
  example: unknown
}

/** Названия видов и типов для экрана «Входящие». */
export const KIND_NAME: Record<string, string> = { workbook: 'рабочая тетрадь', textbook: 'учебник', notebook: 'моя тетрадь', lera: 'от Леры', other: 'другое' }
export const TYPE_NAME: Record<MaterialItem['type'], string> = { word: 'слова', sentence: 'предложения', dialog: 'диалоги', text: 'тексты', grammar: 'грамматика', exercise: 'упражнения', task: 'задания', mistake: 'ошибки', note: 'заметки' }

/** Присланные материалы: пачки из тетрадей и заданий (только владелец; гостю ничего не грузится). */
export const useMaterialsStore = defineStore('materials', () => {
  const progress = useProgressStore()
  const batches = ref<MaterialBatch[]>([])
  const loaded = ref(false)
  const format = ref<MaterialsFormat | null>(null)

  async function call(path: string, init: RequestInit = {}) {
    let res: Response
    try {
      res = await fetchT(`/api/materials${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` } })
    } catch (e) {
      throw new Error(errText(e))
    }
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || `ошибка ${res.status}`)
    return res.json()
  }

  async function load() {
    if (!progress.unlocked) return
    batches.value = ((await call('')) as { batches: MaterialBatch[] }).batches
    loaded.value = true
  }
  async function loadFormat() {
    if (format.value) return
    format.value = (await call('/format')) as MaterialsFormat
  }
  async function setStatus(id: string, status: 'new' | 'done') {
    const row = (await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })) as MaterialBatch
    batches.value = batches.value.map(b => (b.id === id ? row : b))
  }
  async function remove(id: string) {
    await call(`/${id}`, { method: 'DELETE' })
    batches.value = batches.value.filter(b => b.id !== id)
  }

  return { batches, loaded, format, load, loadFormat, setStatus, remove }
})
