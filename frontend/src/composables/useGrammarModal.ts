import { computed } from 'vue'
import { G, shownCard } from '@/data/korean/grammar'

export function useGrammarModal() {
  // своё на каждый запрос: карточка из ?g=… открывается при отрисовке на сервере и не должна «открыться» у других посетителей
  const currentId = useState<string | null>('grammar_modal', () => null)
  /** карточка открыта из «Мои карточки»: у карточек уроков видео там не показываем, только фото */
  const mine = useState<boolean>('grammar_modal_mine', () => false)
  const index = computed(() => G.findIndex(g => g.id === currentId.value))
  const current = computed(() => (index.value >= 0 ? G[index.value]! : null))

  const step = (d: 1 | -1) => {
    for (let i = 1; i <= G.length; i++) {
      const g = G[(index.value + d * i + G.length * 2) % G.length]!
      if (shownCard(g)) return g.id
    }
    return currentId.value
  }

  return {
    current,
    mine,
    open: (id: string, fromMine = false) => {
      mine.value = fromMine
      currentId.value = id
    },
    close: () => (currentId.value = null),
    // листаем только то, что показывает сайт: заглушки и непройденные свои карточки пропускаем
    prev: () => (currentId.value = step(-1)),
    next: () => (currentId.value = step(1)),
  }
}
