import { computed, onMounted } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { useShopStore } from '@/stores/shop'

/** Предметы Юны на экране игры со своей разметкой (не `TaskSession`): владелец ли, сколько предметов, использовать. Гость и без входа: пусто. */
export function useItemBar() {
  const progress = useProgressStore()
  const shop = useShopStore()
  const owner = computed(() => progress.unlocked && !progress.isGuest)
  /** Сколько предметов `id` в запасе (0 у гостя). */
  const count = (id: string) => (owner.value ? shop.count(id) : 0)
  /** Тратит предмет на сервере; false, если не вышло (плашка с причиной уже показана). */
  const use = async (id: string) => owner.value && !shop.busy && !!(await shop.use(id))
  onMounted(() => {
    if (owner.value) void shop.load()
  })
  return { owner, shop, count, use }
}
