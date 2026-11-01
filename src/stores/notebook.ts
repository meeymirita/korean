import { defineStore } from 'pinia'
import { ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

export type Tpl = 'blank' | 'grid' | 'lines' | 'dots' | 'hangul'
/** Штрих: цвет, толщина, точки [x, y, нажим]. */
export interface Stroke { c: string; w: number; p: [number, number, number][] }
export interface NbItem { id: string; kind: 'folder' | 'sheet'; name: string; parent: string | null; tpl: Tpl; fav: number; created: number; updated: number }
export interface NbSheet extends NbItem { text: string; strokes: Stroke[] }

/** Те же ограничения, что на сервере (server/src/config.ts). */
export const MAX_NB_NAME = 100
export const MAX_NB_TEXT = 20_000

function apiError(status: number, body: { error?: string } | null): string {
  if (status === 401) return 'нужно войти по токену'
  if (status === 403) return 'тетрадь доступна только владельцу'
  if (status === 404) return 'не найдено (возможно, уже удалено)'
  if (status === 413 || body?.error === 'drawing too large') return 'рисунок слишком большой'
  if (body?.error === 'folder inside itself') return 'папку нельзя положить внутрь самой себя'
  if (body?.error === 'too deep') return 'слишком много вложенных папок'
  if (body?.error === 'too many items') return 'слишком много папок и листов'
  if (status === 400) return 'сервер не принял данные'
  return `ошибка сервера ${status}`
}

/** Тетрадь: папки и листы с рисунками. Хранятся на сервере, только у владельца. */
export const useNotebookStore = defineStore('notebook', () => {
  const progress = useProgressStore()
  const items = ref<NbItem[]>([])
  const loaded = ref(false)

  async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetchT(`/api/notebook${path}`, {
        method,
        headers: { Authorization: `Bearer ${progress.bearer}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      throw new Error(errText(e))
    }
    if (!res.ok) throw new Error(apiError(res.status, (await res.json().catch(() => null)) as { error?: string } | null))
    return (await res.json()) as T
  }

  const meta = (i: NbItem): NbItem => ({ id: i.id, kind: i.kind, name: i.name, parent: i.parent, tpl: i.tpl, fav: i.fav, created: i.created, updated: i.updated })

  async function load() {
    items.value = (await req<{ items: NbItem[] }>('')).items
    loaded.value = true
  }

  async function create(kind: 'folder' | 'sheet', name: string, parent: string | null, tpl: Tpl = 'blank'): Promise<NbSheet> {
    const it = await req<NbSheet>('', 'POST', { kind, name, parent, tpl })
    items.value.push(meta(it))
    return it
  }

  const openSheet = (id: string) => req<NbSheet>(`/${id}`)

  /** Частичное изменение: название, место, фон, текст, штрихи (последние два только у листа). */
  async function update(id: string, patch: Partial<Pick<NbSheet, 'name' | 'parent' | 'tpl' | 'text' | 'strokes'>> & { fav?: boolean }) {
    const fresh = await req<NbItem>(`/${id}`, 'PATCH', patch)
    const i = items.value.findIndex(x => x.id === id)
    if (i >= 0) items.value[i] = meta(fresh)
  }

  async function remove(id: string) {
    await req(`/${id}`, 'DELETE').catch(e => {
      if (!/не найдено/.test(errText(e))) throw e
    })
    const gone = new Set([id])
    for (let grew = true; grew; ) {
      grew = false
      for (const i of items.value) if (i.parent && gone.has(i.parent) && !gone.has(i.id)) (gone.add(i.id), (grew = true))
    }
    items.value = items.value.filter(i => !gone.has(i.id))
  }

  /** Лежит ли `id` внутри папки `ancestor` (или это она сама). */
  function isInside(id: string | null, ancestor: string): boolean {
    for (let n = 0; id && n < 50; n++) {
      if (id === ancestor) return true
      id = items.value.find(i => i.id === id)?.parent ?? null
    }
    return false
  }

  /** «Тетрадь / Хангыль / Гласные» для папки. */
  function folderPath(id: string | null): string {
    const out: string[] = []
    for (let n = 0; id && n < 50; n++) {
      const f = items.value.find(i => i.id === id)
      if (!f) break
      out.unshift(f.name)
      id = f.parent
    }
    return ['Тетрадь', ...out].join(' / ')
  }

  return { items, loaded, load, create, openSheet, update, remove, isInside, folderPath }
})

/** Округляет точки штриха: рисунок занимает в разы меньше места, на глаз незаметно. */
export function packStrokes(strokes: Stroke[]): Stroke[] {
  const r1 = (n: number) => Math.round(n * 10) / 10
  const r2 = (n: number) => Math.round(n * 100) / 100
  return strokes.map(s => ({ c: s.c, w: s.w, p: s.p.map(([x, y, f]) => [r1(x), r1(y), r2(f)] as [number, number, number]) }))
}
