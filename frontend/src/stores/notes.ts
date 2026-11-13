import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { errText, fetchT } from '@/lib/http'
import { cleanTags } from '@/lib/tags'
import { cleanRemind, sortNotes } from '@/lib/notesMeta'

export interface Note {
  id: string
  title: string
  text: string
  /** id картинок из раздела «Картинки» */
  images: string[]
  /** теги без «#» */
  tags: string[]
  created: number
  updated: number
  /** закреплена сверху списка (только у владельца) */
  pinned: boolean
  /** «Напомнить в»: ГГГГ-ММ-ДДTЧЧ:ММ по часам сервера (только у владельца) */
  remindAt: string | null
}

/** Заметка из корзины: deletedAt в мс. */
export interface TrashedNote extends Note {
  deletedAt: number
}

export interface NotesData {
  v: 1
  /** когда список менялся последний раз: по нему выбирается свежая версия, локальная или с сервера */
  updated: number
  notes: Note[]
}

export type NotesStatus = 'local' | 'saving' | 'saved' | 'error'

/** Те же лимиты, что на сервере (backend/config.mjs). */
export const MAX_NOTES = 200
export const MAX_TITLE = 100
export const MAX_TEXT = 5000
export const MAX_NOTE_IMAGES = 10
/** В карточке виден только кусок текста; остальное по кнопке «Показать полностью». */
export const PREVIEW = 100

const KEY = 'notes_v1'
const PUSH_DELAY = 1000

const empty = (): NotesData => ({ v: 1, updated: 0, notes: [] })

/** Приводит данные из браузера или с сервера к безопасному виду: лишнее и дубли отбрасываются, длина режется по лимитам. */
export function normalizeNotes(raw: unknown): NotesData {
  const r = raw as Partial<NotesData> | null
  if (!r || typeof r !== 'object' || !Array.isArray(r.notes)) return empty()
  const seen = new Set<string>()
  const notes: Note[] = []
  for (const n of r.notes as Partial<Note>[]) {
    if (notes.length >= MAX_NOTES) break
    if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 40 || seen.has(n.id)) continue
    seen.add(n.id)
    notes.push({
      id: n.id,
      title: String(n.title ?? '').slice(0, MAX_TITLE),
      text: String(n.text ?? '').slice(0, MAX_TEXT),
      images: Array.isArray(n.images) ? n.images.filter((i): i is string => typeof i === 'string' && /^[a-f0-9]{16}$/.test(i)).slice(0, MAX_NOTE_IMAGES) : [],
      tags: cleanTags(n.tags),
      created: Number(n.created) || 0,
      updated: Number(n.updated) || 0,
      pinned: n.pinned === true,
      remindAt: cleanRemind(n.remindAt),
    })
  }
  return { v: 1, updated: Number(r.updated) || 0, notes }
}

function load(): NotesData {
  try {
    return normalizeNotes(JSON.parse(localStorage.getItem(KEY) || 'null'))
  } catch {
    return empty()
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const useNotesStore = defineStore('notes', () => {
  const progress = useProgressStore()
  const data = ref<NotesData>(load())
  const status = ref<NotesStatus>('local')
  const message = ref('')
  let applying = false
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Все теги заметок с числом заметок, частые сверху. */
  const tagCounts = computed(() => {
    const m = new Map<string, number>()
    for (const n of data.value.notes) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })

  /** Закреплённые первыми, внутри групп новые сверху. */
  const notes = computed(() => sortNotes(data.value.notes))
  const full = computed(() => data.value.notes.length >= MAX_NOTES)
  /** На сервер заметки уходят только у владельца с токеном; гость и без токена работают локально (у гостя это память). */
  const synced = () => progress.unlocked && !progress.isGuest

  const touch = () => (data.value.updated = Date.now())

  /** Добавляет заметку. Возвращает её или null, если пусто или достигнут лимит. */
  function add(title: string, text: string, images: string[] = [], tags: string[] = []): Note | null {
    const t = title.trim().slice(0, MAX_TITLE)
    const x = text.trim().slice(0, MAX_TEXT)
    if ((!t && !x && !images.length) || full.value) return null
    const now = Date.now()
    const note: Note = { id: newId(), title: t || 'Без названия', text: x, images: images.slice(0, MAX_NOTE_IMAGES), tags: cleanTags(tags), created: now, updated: now, pinned: false, remindAt: null }
    data.value.notes.push(note)
    touch()
    return note
  }

  function update(id: string, patch: { title?: string; text?: string; images?: string[]; tags?: string[]; pinned?: boolean; remindAt?: string | null }) {
    const n = data.value.notes.find(x => x.id === id)
    if (!n) return false
    if (patch.title !== undefined) n.title = patch.title.trim().slice(0, MAX_TITLE) || 'Без названия'
    if (patch.text !== undefined) n.text = patch.text.trim().slice(0, MAX_TEXT)
    if (patch.images !== undefined) n.images = patch.images.slice(0, MAX_NOTE_IMAGES)
    if (patch.tags !== undefined) n.tags = cleanTags(patch.tags)
    // закрепление и напоминание только у владельца: гость ничего не сохраняет
    if (patch.pinned !== undefined && synced()) n.pinned = patch.pinned
    if (patch.remindAt !== undefined && synced()) n.remindAt = cleanRemind(patch.remindAt)
    n.updated = Date.now()
    touch()
    return true
  }

  function remove(id: string) {
    const before = data.value.notes.length
    data.value.notes = data.value.notes.filter(x => x.id !== id)
    if (data.value.notes.length !== before) touch()
  }

  /** Закрепить или открепить. Гостю и без токена не сохраняется: возвращает false. */
  function togglePin(id: string) {
    const n = data.value.notes.find(x => x.id === id)
    if (!n || !synced()) return false
    return update(id, { pinned: !n.pinned })
  }

  /** Корзина, закрепление и напоминание есть только у владельца: у гостя заметки в памяти и удаляются сразу. */
  const owner = computed(() => progress.unlocked && !progress.isGuest)

  /* ---------- сервер ---------- */
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })
  const netError = errText

  async function push() {
    if (!synced()) return
    clearTimeout(timer)
    timer = undefined
    status.value = 'saving'
    try {
      const res = await fetchT('/api/notes', { method: 'PUT', headers: headers(), body: JSON.stringify(data.value) })
      if (!res.ok) throw new Error(res.status === 413 ? 'заметки слишком большие' : `ошибка сервера ${res.status}`)
      status.value = 'saved'
      message.value = 'сохранено на сервере'
    } catch (e) {
      status.value = 'error'
      message.value = netError(e)
    }
  }

  /* ---------- корзина (30 дней, на сервере) ---------- */
  const trash = ref<TrashedNote[]>([])
  const trashLoaded = ref(false)

  /** Заметки из корзины. Сначала уходит накопленное (удалённое только что ещё не на сервере). */
  async function loadTrash() {
    if (!synced()) return
    if (timer || status.value === 'saving') await push()
    const res = await fetchT('/api/notes/trash', { headers: headers() })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    const d = (await res.json()) as { items: TrashedNote[] }
    trash.value = normalizeNotes({ notes: d.items }).notes.map((n, i) => ({ ...n, deletedAt: Number(d.items[i]?.deletedAt) || 0 }))
    trashLoaded.value = true
  }

  /** Возвращает заметку из корзины: сервер её восстанавливает, сайт добавляет в список, не отправляя его обратно. */
  async function restore(id: string) {
    const res = await fetchT(`/api/notes/${encodeURIComponent(id)}/restore`, { method: 'POST', headers: headers() })
    if (res.status === 400) throw new Error(`в списке уже ${MAX_NOTES} заметок: освободите место`)
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    const d = (await res.json()) as { updated: number; note: Note }
    const note = normalizeNotes({ notes: [d.note] }).notes[0]
    applying = true
    if (note && !data.value.notes.some(n => n.id === id)) data.value.notes.push(note)
    data.value.updated = Number(d.updated) || Date.now()
    applying = false
    trash.value = trash.value.filter(n => n.id !== id)
  }

  /** Стирает из корзины насовсем; confirm — повторно введённый токен (проверяет сервер). */
  async function purge(id: string, confirm: string) {
    if (!/^[\x20-\x7e]+$/.test(confirm)) throw new Error('неверный токен подтверждения')
    const res = await fetchT(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...headers(), 'X-Confirm-Token': confirm } })
    if (res.status === 403) throw new Error('неверный токен подтверждения')
    if (res.status === 429) throw new Error('слишком много попыток, подождите несколько минут')
    if (!res.ok && res.status !== 404) throw new Error(`ошибка сервера ${res.status}`)
    trash.value = trash.value.filter(n => n.id !== id)
  }

  /** Подтягивает заметки с сервера: побеждает более свежая версия; если свежее локальная, она уходит на сервер. */
  async function init() {
    if (!synced()) {
      status.value = 'local'
      message.value = progress.isGuest ? 'гостевой режим: заметки не сохраняются' : 'заметки хранятся только в этом браузере'
      return
    }
    status.value = 'saving'
    try {
      const res = await fetchT('/api/notes', { headers: headers() })
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      const remote = normalizeNotes(await res.json())
      if (remote.updated > data.value.updated) {
        applying = true
        data.value = remote
        applying = false
        status.value = 'saved'
        message.value = 'загружено с сервера'
      } else if (data.value.updated > remote.updated) {
        await push()
      } else {
        status.value = 'saved'
        message.value = 'сохранено на сервере'
      }
    } catch (e) {
      status.value = 'error'
      message.value = netError(e)
    }
  }

  watch(
    data,
    () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(data.value))
      } catch {
        /* без запоминания в браузере */
      }
      if (applying || !synced()) return
      status.value = 'saving'
      clearTimeout(timer)
      timer = setTimeout(() => void push(), PUSH_DELAY)
    },
    // sync: колбэк срабатывает сразу, пока флаг applying ещё поднят, и загруженное с сервера не уходит обратно
    { deep: true, flush: 'sync' },
  )

  return { data, notes, tagCounts, full, status, message, owner, trash, trashLoaded, add, update, remove, togglePin, loadTrash, restore, purge, init, push }
})
