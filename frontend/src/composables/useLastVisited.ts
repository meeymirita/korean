import { ref } from 'vue'
import { refTabs, sectionById } from '@/data/korean/sections'

const KEY = 'last_section'
/** дата → раздел → когда заходили в последний раз (мс); для напоминаний в колокольчике, см. useNotices.ts */
const VISITS_KEY = 'section_visits'

export interface Visited {
  path: string
  title: string
}

function read(): Visited | null {
  if (import.meta.server) return null // на сервере одна переменная на всех посетителей: «последний раздел» только в браузере
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v && typeof v.path === 'string' && typeof v.title === 'string' ? v : null
  } catch {
    return null
  }
}

export const lastVisited = ref<Visited | null>(read())

/** Когда последний раз заходили в раздел (мс), 0 — не заходили (или нет данных браузера). */
export function lastVisitOf(id: string): number {
  if (import.meta.server) return 0
  try {
    const v = JSON.parse(localStorage.getItem(VISITS_KEY) || '{}')
    return (v && typeof v === 'object' && Number(v[id])) || 0
  } catch {
    return 0
  }
}

/** Запоминает страницу раздела (кроме главной раздела), чтобы предложить вернуться. */
export function visit(path: string) {
  if (import.meta.server) return
  const [, , id, tab] = path.split('/')
  if (!id || id === 'home') return
  const section = id === 'ref' ? refTabs.find(t => t.id === tab) : sectionById(id)
  if (!section) return
  const v = { path, title: section.menu }
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
    const visits = JSON.parse(localStorage.getItem(VISITS_KEY) || '{}')
    visits[id] = Date.now()
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits))
  } catch {
    /* ничего страшного */
  }
  lastVisited.value = v
}
