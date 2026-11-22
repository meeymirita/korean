import { computed, ref } from 'vue'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/**
 * Отметки «просмотрено» у влогов: на сервере (на всех устройствах, `GET/PUT /api/vlog-watched`), копия в браузере на случай, если сервер не ответил.
 * Гость ничего не сохраняет. Общий код для списка «Влога» и страницы «Разбор влога» (там от отметки зависит доступ к тесту).
 */
const WATCHED_KEY = 'vlog_watched_v1'

export function useVlogWatched() {
  const progress = useProgressStore()
  const toast = useToastStore()
  const watched = ref<string[]>([])
  const canSave = computed(() => !progress.isGuest && !!progress.bearer)
  const authHeaders = () => ({ Authorization: `Bearer ${progress.bearer}`, 'Content-Type': 'application/json' })

  async function toggleWatched(yt: string) {
    const had = watched.value.includes(yt)
    watched.value = had ? watched.value.filter(x => x !== yt) : [...watched.value, yt]
    try {
      localStorage.setItem(WATCHED_KEY, JSON.stringify(watched.value))
    } catch {
      /* хранилище недоступно */
    }
    if (!canSave.value) return
    try {
      const res = await fetchT('/api/vlog-watched', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ watched: watched.value }) })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      toast.error('Отметка сохранена только в этом браузере: сервер не ответил')
    }
  }

  async function loadWatched() {
    try {
      const local = JSON.parse(localStorage.getItem(WATCHED_KEY) ?? '[]')
      if (Array.isArray(local)) watched.value = local.filter((x): x is string => typeof x === 'string')
    } catch {
      /* повреждённая запись */
    }
    if (!canSave.value) return
    try {
      const res = await fetchT('/api/vlog-watched', { headers: authHeaders() })
      if (!res.ok) return
      const remote = ((await res.json()) as { watched?: string[] }).watched ?? []
      if (remote.length || !watched.value.length) watched.value = remote
      else void fetchT('/api/vlog-watched', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ watched: watched.value }) }).catch(() => undefined)
    } catch {
      /* работаем с тем, что в браузере */
    }
  }

  return { watched, canSave, toggleWatched, loadWatched }
}
