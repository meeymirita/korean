import { computed } from 'vue'
import { G } from '@/data/korean/grammar'

export function useGrammarModal() {
  // своё на каждый запрос: карточка из ?g=… открывается при отрисовке на сервере и не должна «открыться» у других посетителей
  const currentId = useState<string | null>('grammar_modal', () => null)
  /** карточка открыта из «Мои карточки»: у карточек уроков видео там не показываем, только фото */
  const mine = useState<boolean>('grammar_modal_mine', () => false)
  const index = computed(() => G.findIndex(g => g.id === currentId.value))
  const current = computed(() => (index.value >= 0 ? G[index.value]! : null))

  return {
    current,
    mine,
    open: (id: string, fromMine = false) => {
      mine.value = fromMine
      currentId.value = id
    },
    close: () => (currentId.value = null),
    prev: () => (currentId.value = G[(index.value + G.length - 1) % G.length]!.id),
    next: () => (currentId.value = G[(index.value + 1) % G.length]!.id),
  }
}
