import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { askConfirm } from '@/composables/useConfirm'
import { errText, fetchT, LONG_TIMEOUT } from '@/lib/http'
import { NEUTRAL, type Placement } from '@/lib/siteImages'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Подмена картинки сайта: `src` пустой, если заменено только положение исходной картинки. */
export interface SiteImg extends Placement {
  src: string
}
/** Правка, которая видна на странице сразу, но на сервер уйдёт только после «Сохранить». */
export interface Draft extends SiteImg {
  key: string
  /** выбранный файл: показывается через blob-адрес, на сервер уходит при сохранении */
  file?: File
}

const CACHE = 'site_images_cache'
const FLAG = 'site_edit_mode'
const num = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? n : d)

function readCache(): Record<string, SiteImg> {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Record<string, Partial<SiteImg>>
    const out: Record<string, SiteImg> = {}
    for (const [k, v] of Object.entries(raw)) if (v && typeof v.src === 'string') out[k] = { src: v.src, x: num(v.x, 50), y: num(v.y, 50), zoom: num(v.zoom, 1) }
    return out
  } catch {
    return {}
  }
}

/** Картинки сайта, которые владелец заменил или подвинул в режиме редактирования. Видят все посетители. */
export const useSiteImagesStore = defineStore('siteImages', () => {
  const progress = useProgressStore()
  const toast = useToastStore()
  const items = ref<Record<string, SiteImg>>(readCache())
  const draft = ref<Draft | null>(null)
  /** с чего начиналась правка: по нему видно, есть ли что сохранять */
  const base = ref<Placement & { src: string } | null>(null)
  const busy = ref(false)

  const flag = ref(false)
  try {
    flag.value = localStorage.getItem(FLAG) === '1'
  } catch {
    /* без запоминания */
  }
  const canEdit = computed(() => progress.unlocked && !progress.isGuest)
  /** режим редактирования: включается галочкой в «Настройках», только у владельца, по умолчанию выключен */
  const editMode = computed(() => flag.value && canEdit.value)
  function setEditMode(v: boolean) {
    flag.value = v
    try {
      localStorage.setItem(FLAG, v ? '1' : '0')
    } catch {
      /* без запоминания */
    }
    if (!v) cancel()
  }

  const effective = (key: string): SiteImg | null => (draft.value?.key === key ? draft.value : items.value[key] ?? null)
  const dirty = computed(() => !!draft.value && !!base.value && (draft.value.src !== base.value.src || draft.value.x !== base.value.x || draft.value.y !== base.value.y || draft.value.zoom !== base.value.zoom))

  async function load() {
    try {
      const r = await fetchT('/api/site-images')
      if (!r.ok) return
      const list = ((await r.json()) as { items?: Record<string, Partial<SiteImg>> }).items ?? {}
      const out: Record<string, SiteImg> = {}
      for (const [k, v] of Object.entries(list)) out[k] = { src: typeof v.src === 'string' ? v.src : '', x: num(v.x, 50), y: num(v.y, 50), zoom: num(v.zoom, 1) }
      items.value = out
      try {
        localStorage.setItem(CACHE, JSON.stringify(out))
      } catch {
        /* кэш нужен только чтобы подмена появлялась без мигания */
      }
    } catch {
      /* сервера нет: остаются исходные картинки и кэш */
    }
  }

  function begin(key: string, place: Placement = NEUTRAL) {
    cancel()
    const cur = items.value[key] ?? { src: '', ...place }
    draft.value = { key, ...cur }
    base.value = { src: cur.src, x: cur.x, y: cur.y, zoom: cur.zoom }
  }
  function cancel() {
    if (draft.value?.file) URL.revokeObjectURL(draft.value.src)
    draft.value = null
    base.value = null
  }
  function patch(p: Partial<Placement>) {
    if (draft.value) draft.value = { ...draft.value, ...p }
  }
  function useUrl(src: string) {
    if (!draft.value) return
    if (draft.value.file) URL.revokeObjectURL(draft.value.src)
    draft.value = { ...draft.value, src, file: undefined, x: 50, y: 50, zoom: 1 }
  }
  /** Новая картинка из файла. `keepPlace` оставляет сдвиг и приближение (так делает «Удалить фон»). */
  function useFile(file: File, keepPlace = false) {
    if (!draft.value) return
    if (draft.value.file) URL.revokeObjectURL(draft.value.src)
    const place = keepPlace ? {} : { x: 50, y: 50, zoom: 1 }
    draft.value = { ...draft.value, src: URL.createObjectURL(file), file, ...place }
  }

  const headers = () => ({ Authorization: `Bearer ${progress.bearer}` })
  async function ok(r: Response): Promise<SiteImg> {
    if (!r.ok) throw new Error(r.status === 413 ? 'Файл слишком большой' : r.status === 400 ? 'Сервер не принял картинку' : `Ошибка ${r.status}`)
    return (await r.json()) as SiteImg
  }

  /** Отправляет правку на сервер: файл, потом положение. После этого страница у всех показывает новую картинку. */
  async function save(): Promise<boolean> {
    const d = draft.value
    if (!d || busy.value) return false
    busy.value = true
    try {
      const key = encodeURIComponent(d.key)
      const pos = { x: d.x, y: d.y, zoom: d.zoom }
      let res: SiteImg
      if (d.file) {
        const form = new FormData()
        form.append('file', d.file)
        res = await ok(await fetchT(`/api/site-images/${key}/file`, { method: 'POST', headers: headers(), body: form }, LONG_TIMEOUT))
        if (d.x !== 50 || d.y !== 50 || d.zoom !== 1) res = await ok(await fetchT(`/api/site-images/${key}`, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(pos) }))
      } else {
        const body = d.src && d.src !== base.value?.src ? { url: d.src, ...pos } : pos
        res = await ok(await fetchT(`/api/site-images/${key}`, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      }
      const keep = d.file ? d.src : ''
      items.value = { ...items.value, [d.key]: { src: res.src, x: res.x, y: res.y, zoom: res.zoom } }
      try {
        localStorage.setItem(CACHE, JSON.stringify(items.value))
      } catch {
        /* без кэша */
      }
      draft.value = null
      base.value = null
      if (keep) URL.revokeObjectURL(keep)
      toast.ok('Картинка сохранена: теперь она такая у всех')
      return true
    } catch (e) {
      toast.error(errText(e) || 'Не удалось сохранить картинку')
      return false
    } finally {
      busy.value = false
    }
  }

  /** Вернуть исходную картинку сайта (подмена удаляется с сервера). */
  async function reset(key: string) {
    const yes = await askConfirm({ title: 'Вернуть исходную картинку?', text: 'Твоя замена и положение пропадут у всех посетителей.', ok: 'Вернуть', danger: true })
    if (!yes) return
    busy.value = true
    try {
      const r = await fetchT(`/api/site-images/${encodeURIComponent(key)}`, { method: 'DELETE', headers: headers() })
      if (!r.ok && r.status !== 404) throw new Error(`Ошибка ${r.status}`)
      const { [key]: _gone, ...rest } = items.value
      items.value = rest
      try {
        localStorage.setItem(CACHE, JSON.stringify(rest))
      } catch {
        /* без кэша */
      }
      cancel()
      toast.ok('Вернул исходную картинку')
    } catch (e) {
      toast.error(errText(e) || 'Не удалось вернуть картинку')
    } finally {
      busy.value = false
    }
  }

  return { items, draft, busy, dirty, editMode, canEdit, effective, setEditMode, load, begin, cancel, patch, useUrl, useFile, save, reset }
})
