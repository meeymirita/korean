import { computed, ref } from 'vue'
import { G } from '@/data/korean/grammar'

const currentId = ref<string | null>(null)

export function useGrammarModal() {
  const index = computed(() => G.findIndex(g => g.id === currentId.value))
  const current = computed(() => (index.value >= 0 ? G[index.value]! : null))

  return {
    current,
    open: (id: string) => (currentId.value = id),
    close: () => (currentId.value = null),
    prev: () => (currentId.value = G[(index.value + G.length - 1) % G.length]!.id),
    next: () => (currentId.value = G[(index.value + 1) % G.length]!.id),
  }
}
