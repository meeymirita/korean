import { ref } from 'vue'
import { refTabs, sectionById } from '@/data/korean/sections'

const KEY = 'last_section'

export interface Visited {
  path: string
  title: string
}

function read(): Visited | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v && typeof v.path === 'string' && typeof v.title === 'string' ? v : null
  } catch {
    return null
  }
}

export const lastVisited = ref<Visited | null>(read())

/** Запоминает страницу раздела (кроме главной раздела), чтобы предложить вернуться. */
export function visit(path: string) {
  const [, , id, tab] = path.split('/')
  if (!id || id === 'home') return
  const section = id === 'ref' ? refTabs.find(t => t.id === tab) : sectionById(id)
  if (!section) return
  const v = { path, title: section.menu }
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ничего страшного */
  }
  lastVisited.value = v
}
