import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useProgressStore } from '@/stores/progress'

export interface Note {
  id: string
  title: string
  text: string
  created: number
  updated: number
}

export interface NotesData {
  v: 1
  /** когда список менялся последний раз: по нему выбирается свежая версия, локальная или с сервера */
  updated: number
  notes: Note[]
}

export type NotesStatus = 'local' | 'saving' | 'saved' | 'error'

/** Те же лимиты, что на сервере (server/config.mjs). */
export const MAX_NOTES = 200
export const MAX_TITLE = 100
export const MAX_TEXT = 5000

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
      created: Number(n.created) || 0,
      updated: Number(n.updated) || 0,
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

  /** Новые сверху. */
  const notes = computed(() => [...data.value.notes].sort((a, b) => b.created - a.created))
  const full = computed(() => data.value.notes.length >= MAX_NOTES)
  /** На сервер заметки уходят только у владельца с токеном; гость и без токена работают локально (у гостя это память). */
  const synced = () => progress.unlocked && !progress.isGuest

  const touch = () => (data.value.updated = Date.now())

  /** Добавляет заметку. Возвращает её или null, если пусто или достигнут лимит. */
  function add(title: string, text: string): Note | null {
    const t = title.trim().slice(0, MAX_TITLE)
    const x = text.trim().slice(0, MAX_TEXT)
    if ((!t && !x) || full.value) return null
    const now = Date.now()
    const note: Note = { id: newId(), title: t || 'Без названия', text: x, created: now, updated: now }
    data.value.notes.push(note)
    touch()
    return note
  }

  function update(id: string, patch: { title?: string; text?: string }) {
    const n = data.value.notes.find(x => x.id === id)
    if (!n) return false
    if (patch.title !== undefined) n.title = patch.title.trim().slice(0, MAX_TITLE) || 'Без названия'
    if (patch.text !== undefined) n.text = patch.text.trim().slice(0, MAX_TEXT)
    n.updated = Date.now()
    touch()
    return true
  }

  function remove(id: string) {
    const before = data.value.notes.length
    data.value.notes = data.value.notes.filter(x => x.id !== id)
    if (data.value.notes.length !== before) touch()
  }

  /* ---------- сервер ---------- */
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.token}` })
  const netError = (e: unknown) => ((e as Error).message === 'Failed to fetch' ? 'сервер недоступен' : (e as Error).message)

  async function push() {
    if (!synced()) return
    clearTimeout(timer)
    status.value = 'saving'
    try {
      const res = await fetch('/api/notes', { method: 'PUT', headers: headers(), body: JSON.stringify(data.value) })
      if (!res.ok) throw new Error(res.status === 413 ? 'заметки слишком большие' : `ошибка сервера ${res.status}`)
      status.value = 'saved'
      message.value = 'сохранено на сервере'
    } catch (e) {
      status.value = 'error'
      message.value = netError(e)
    }
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
      const res = await fetch('/api/notes', { headers: headers() })
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
      timer = setTimeout(push, PUSH_DELAY)
    },
    // sync: колбэк срабатывает сразу, пока флаг applying ещё поднят, и загруженное с сервера не уходит обратно
    { deep: true, flush: 'sync' },
  )

  return { data, notes, full, status, message, add, update, remove, init, push }
})
