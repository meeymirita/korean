import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { LONG_TIMEOUT, fetchT } from '@/lib/http'

export interface ImageItem {
  id: string
  name: string
  /** название */
  caption: string
  description: string
  mime: string
  size: number
  width: number
  height: number
  created: number
}

/** Те же ограничения, что на сервере (server/src/config.ts). */
export const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export type ImageKind = 'gallery' | 'note' | 'cover'
export const MAX_CAPTION = 200
export const MAX_DESCRIPTION = 1000

const fmtMb = (n: number) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)
export const formatSize = (n: number) => (n >= 1024 * 1024 ? `${fmtMb(n)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`)

/** Человеческий текст по ответу сервера на загрузку. */
function uploadError(status: number): string {
  if (status === 413) return 'файл слишком большой или закончилось место'
  if (status === 400) return 'не получилось прочитать картинку (нужны JPEG, PNG, GIF или WebP)'
  if (status === 403) return 'картинки доступны только владельцу'
  if (status === 401) return 'нужно войти по токену'
  return `ошибка сервера ${status}`
}

export const useImagesStore = defineStore('images', () => {
  const progress = useProgressStore()
  const items = ref<ImageItem[]>([])
  const used = ref(0)
  const limit = ref(500 * 1024 * 1024)
  const maxFile = ref(50 * 1024 * 1024)
  const loaded = ref(false)
  /** blob-адреса картинок: <img> не умеет слать токен, поэтому файлы запрашиваются с заголовком и показываются через blob */
  const blobs = new Map<string, Promise<string>>()

  const headers = (json = false) => ({ Authorization: `Bearer ${progress.token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) })

  /** Проверка файла до отправки; текст ошибки или null. */
  function check(file: { type: string; size: number; name: string }): string | null {
    if (!ALLOWED.includes(file.type)) return `${file.name}: нужны JPEG, PNG, GIF или WebP`
    if (file.size > maxFile.value) return `${file.name}: больше ${formatSize(maxFile.value)}`
    if (used.value + file.size > limit.value) return `${file.name}: не хватает места (занято ${formatSize(used.value)} из ${formatSize(limit.value)})`
    return null
  }

  async function load() {
    const res = await fetchT('/api/images', { headers: headers() })
    if (!res.ok) throw new Error(uploadError(res.status))
    const d = (await res.json()) as { items: ImageItem[]; used: number; limit: number; maxFile: number }
    items.value = d.items
    used.value = d.used
    limit.value = d.limit
    maxFile.value = d.maxFile
    loaded.value = true
  }

  /** kind: «Картинки» (gallery), вложение заметки (note) или обложка кабинета (cover): у каждого назначения свой список. */
  async function upload(file: File, caption = '', kind: ImageKind = 'gallery'): Promise<ImageItem> {
    const form = new FormData()
    form.append('file', file)
    if (caption) form.append('caption', caption)
    if (kind !== 'gallery') form.append('kind', kind)
    let res: Response
    try {
      res = await fetchT('/api/images', { method: 'POST', headers: headers(), body: form }, LONG_TIMEOUT)
    } catch {
      throw new Error('сервер недоступен')
    }
    if (!res.ok) throw new Error(uploadError(res.status))
    const item = (await res.json()) as ImageItem & { ext?: string }
    if (kind === 'gallery') items.value.unshift(item)
    used.value += item.size
    return item
  }

  /** Меняет название и/или описание картинки. */
  async function update(id: string, patch: { caption?: string; description?: string }) {
    const res = await fetchT(`/api/images/${id}`, { method: 'PATCH', headers: headers(true), body: JSON.stringify(patch) })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    const it = items.value.find(i => i.id === id)
    if (it) {
      if (patch.caption !== undefined) it.caption = patch.caption.trim()
      if (patch.description !== undefined) it.description = patch.description.trim()
    }
  }

  async function remove(id: string) {
    const res = await fetchT(`/api/images/${id}`, { method: 'DELETE', headers: headers() })
    if (!res.ok && res.status !== 404) throw new Error(`ошибка сервера ${res.status}`)
    const it = items.value.find(i => i.id === id)
    if (it) used.value = Math.max(0, used.value - it.size)
    items.value = items.value.filter(i => i.id !== id)
    for (const kind of ['file', 'thumb']) {
      const key = `${id}/${kind}`
      void blobs.get(key)?.then(u => URL.revokeObjectURL(u))
      blobs.delete(key)
    }
  }

  /** Адрес для <img>: оригинал (file) или миниатюра (thumb). Каждый запрашивается один раз. */
  function blobUrl(id: string, kind: 'file' | 'thumb'): Promise<string> {
    const key = `${id}/${kind}`
    let p = blobs.get(key)
    if (!p) {
      p = fetchT(`/api/images/${id}/${kind}`, { headers: headers() }, LONG_TIMEOUT).then(async res => {
        if (!res.ok) throw new Error(`ошибка ${res.status}`)
        return URL.createObjectURL(await res.blob())
      })
      p.catch(() => blobs.delete(key)) // не получилось: в следующий раз попробуем снова
      blobs.set(key, p)
    }
    return p
  }

  /** Освобождает память от всех blob-адресов (при уходе со вкладки). */
  function release() {
    for (const p of blobs.values()) void p.then(u => URL.revokeObjectURL(u)).catch(() => undefined)
    blobs.clear()
  }

  return { items, used, limit, maxFile, loaded, check, load, upload, update, remove, blobUrl, release }
})
