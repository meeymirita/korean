import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { LONG_TIMEOUT, fetchT } from '@/lib/http'
import { cleanTags } from '@/lib/tags'

export interface PlanFile {
  id: string
  name: string
  mime: string
  size: number
  /** 1, если у картинки есть миниатюра */
  thumb: number
  created: number
}

export interface Plan {
  id: string
  /** ГГГГ-ММ-ДД */
  day: string
  /** ЧЧ:ММ или пусто */
  time: string
  title: string
  text: string
  tags: string[]
  created: number
  updated: number
  files: PlanFile[]
}

/** Те же ограничения, что на сервере (server/src/config.ts). */
export const MAX_PLAN_TITLE = 100
export const MAX_PLAN_TEXT = 5000
export const MAX_PLAN_FILES = 20
export const MAX_DOC = 25 * 1024 * 1024
export const DOC_ACCEPT = '.pdf,.doc,.docx,image/jpeg,image/png,image/gif,image/webp'

const DOC_EXT = /\.(pdf|docx?|jpe?g|png|gif|webp)$/i
export const isImage = (mime: string) => mime.startsWith('image/')

const fmtMb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)
export const formatSize = (n: number) => (n >= 1024 * 1024 ? `${fmtMb(n)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`)

function apiError(status: number): string {
  if (status === 413) return 'файл слишком большой или закончилось место'
  if (status === 400) return 'не получилось принять файл (нужны PDF, Word или картинка)'
  if (status === 403) return 'записи доступны только владельцу'
  if (status === 401) return 'нужно войти по токену'
  return `ошибка сервера ${status}`
}

/** Записи календаря (занятия, созвоны, домашка) с файлами. Хранятся на сервере, только у владельца. */
export const usePlansStore = defineStore('plans', () => {
  const progress = useProgressStore()
  const items = ref<Plan[]>([])
  const used = ref(0)
  const limit = ref(1024 * 1024 * 1024)
  const loaded = ref(false)
  const blobs = new Map<string, Promise<string>>()

  const auth = (json = false) => ({ Authorization: `Bearer ${progress.bearer}`, ...(json ? { 'Content-Type': 'application/json' } : {}) })

  /** Записи по дням: ключ ГГГГ-ММ-ДД. */
  const byDay = computed(() => {
    const m = new Map<string, Plan[]>()
    for (const p of items.value) m.set(p.day, [...(m.get(p.day) ?? []), p].sort((a, b) => a.time.localeCompare(b.time) || a.created - b.created))
    return m
  })
  const tagCounts = computed(() => {
    const m = new Map<string, number>()
    for (const p of items.value) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })

  /** Проверка файла до отправки; текст ошибки или null. */
  function check(file: { name: string; size: number }): string | null {
    if (!DOC_EXT.test(file.name)) return `${file.name}: нужны PDF, Word (.doc, .docx) или картинка`
    if (file.size > MAX_DOC) return `${file.name}: больше ${formatSize(MAX_DOC)}`
    if (used.value + file.size > limit.value) return `${file.name}: не хватает места (занято ${formatSize(used.value)} из ${formatSize(limit.value)})`
    return null
  }

  async function load() {
    const res = await fetchT('/api/plans', { headers: auth() })
    if (!res.ok) throw new Error(apiError(res.status))
    const d = (await res.json()) as { items: Plan[]; used: number; limit: number }
    items.value = d.items
    used.value = d.used
    limit.value = d.limit
    loaded.value = true
  }

  async function add(fields: { day: string; time: string; title: string; text: string; tags: string[] }): Promise<Plan> {
    const res = await fetchT('/api/plans', { method: 'POST', headers: auth(true), body: JSON.stringify({ ...fields, tags: cleanTags(fields.tags) }) })
    if (!res.ok) throw new Error(apiError(res.status))
    const plan = (await res.json()) as Plan
    items.value.push(plan)
    return plan
  }

  async function update(id: string, patch: Partial<Pick<Plan, 'day' | 'time' | 'title' | 'text' | 'tags'>>) {
    const res = await fetchT(`/api/plans/${id}`, { method: 'PATCH', headers: auth(true), body: JSON.stringify(patch.tags ? { ...patch, tags: cleanTags(patch.tags) } : patch) })
    if (!res.ok) throw new Error(apiError(res.status))
    const fresh = (await res.json()) as Plan
    const i = items.value.findIndex(p => p.id === id)
    if (i >= 0) items.value[i] = fresh
  }

  async function remove(id: string) {
    const res = await fetchT(`/api/plans/${id}`, { method: 'DELETE', headers: auth() })
    if (!res.ok && res.status !== 404) throw new Error(apiError(res.status))
    const p = items.value.find(x => x.id === id)
    for (const f of p?.files ?? []) {
      used.value = Math.max(0, used.value - f.size)
      forget(f.id)
    }
    items.value = items.value.filter(x => x.id !== id)
  }

  async function upload(planId: string, file: File): Promise<PlanFile> {
    const form = new FormData()
    form.append('file', file)
    let res: Response
    try {
      res = await fetchT(`/api/plans/${planId}/files`, { method: 'POST', headers: auth(), body: form }, LONG_TIMEOUT)
    } catch {
      throw new Error('сервер недоступен')
    }
    if (!res.ok) throw new Error(apiError(res.status))
    const f = (await res.json()) as PlanFile
    items.value.find(p => p.id === planId)?.files.push(f)
    used.value += f.size
    return f
  }

  async function removeFile(planId: string, fileId: string) {
    const res = await fetchT(`/api/plans/files/${fileId}`, { method: 'DELETE', headers: auth() })
    if (!res.ok && res.status !== 404) throw new Error(apiError(res.status))
    const p = items.value.find(x => x.id === planId)
    const f = p?.files.find(x => x.id === fileId)
    if (p) p.files = p.files.filter(x => x.id !== fileId)
    if (f) used.value = Math.max(0, used.value - f.size)
    forget(fileId)
  }

  function forget(fileId: string) {
    for (const kind of ['file', 'thumb']) {
      const key = `${fileId}/${kind}`
      void blobs.get(key)?.then(u => URL.revokeObjectURL(u))
      blobs.delete(key)
    }
  }

  /** Адрес для <img> и открытия: файл запрашивается с токеном и показывается через blob, один раз. */
  function blobUrl(fileId: string, kind: 'file' | 'thumb'): Promise<string> {
    const key = `${fileId}/${kind}`
    let p = blobs.get(key)
    if (!p) {
      p = fetchT(`/api/plans/files/${fileId}/${kind}`, { headers: auth() }, LONG_TIMEOUT).then(async res => {
        if (!res.ok) throw new Error(`ошибка ${res.status}`)
        return URL.createObjectURL(await res.blob())
      })
      p.catch(() => blobs.delete(key))
      blobs.set(key, p)
    }
    return p
  }

  function release() {
    for (const p of blobs.values()) void p.then(u => URL.revokeObjectURL(u)).catch(() => undefined)
    blobs.clear()
  }

  return { items, used, limit, loaded, byDay, tagCounts, check, load, add, update, remove, upload, removeFile, blobUrl, release }
})
