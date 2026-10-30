import { computed } from 'vue'
import { useImagesStore } from '@/stores/images'
import { useNotesStore } from '@/stores/notes'
import { usePlansStore } from '@/stores/plans'

/** Общий набор тегов заметок, картинок и записей календаря: из него предлагаются подсказки при вводе и чипы для фильтра. Частые сверху. */
export function useAllTags() {
  const notes = useNotesStore()
  const images = useImagesStore()
  const plans = usePlansStore()
  return computed(() => {
    const all = new Map<string, number>()
    for (const m of [notes.tagCounts, images.tagCounts, plans.tagCounts]) for (const [t, n] of m) all.set(t, (all.get(t) ?? 0) + n)
    return [...all].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([t]) => t)
  })
}
