import { ref } from 'vue'
import { renderCard, shareBlob, type CardSpec } from '@/lib/shareCard'
import { useToastStore } from '@/stores/toast'

/** Кнопка «Поделиться»: рисует карточку 1200×630 и отдаёт её в меню телефона или скачивает. */
export function useShareCard() {
  const toast = useToastStore()
  const busy = ref(false)
  async function share(spec: CardSpec, filename: string) {
    if (busy.value) return
    busy.value = true
    try {
      const blob = await renderCard(spec)
      const how = await shareBlob(blob, filename.replace(/[^\p{L}\p{N}-]+/gu, '-') + '.png', `${spec.title}${spec.sub ? ' — ' + spec.sub : ''}`)
      if (how === 'downloaded') toast.ok('Карточка сохранена в загрузках')
    } catch (e) {
      toast.error((e as Error).message || 'Не получилось сделать карточку')
    } finally {
      busy.value = false
    }
  }
  return { share, busy }
}
