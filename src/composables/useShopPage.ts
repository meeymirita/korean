import { computed, onMounted, ref, watch } from 'vue'
import { itemName, type ShopItem } from '@/data/shop'
import { type Goal, type LogRow, useShopStore } from '@/stores/shop'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Общая логика магазина: вкладка кабинета и страница «Магазин» показывают одно и то же по-разному. */
export function useShopPage() {
  const shop = useShopStore()
  const progress = useProgressStore()
  const st = computed(() => shop.state)
  const coins = computed(() => progress.data.coins)
  const rows = ref<LogRow[]>([])
  const kind = ref('')
  const loadLog = async () => (rows.value = await shop.log(kind.value))
  onMounted(() => {
    void shop.load()
    void loadLog()
  })
  watch(kind, loadLog)
  // страницу обновили, а вход по токену ещё проверяется: загрузить магазин, как только доступ откроется
  watch(() => progress.unlocked, u => u && void shop.load())

  const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const pct = (g: { now: number; goal: number }) => Math.min(100, Math.round((g.now / g.goal) * 100))
  const isActive = (id: string) => (id === 'shield' ? !!st.value?.active.shield : id === 'double' ? !!st.value?.active.double : false)
  const goalText = (g: Goal) => (g.paid ? 'получено' : `${Math.min(g.now, g.goal)} из ${g.goal}`)
  const dailyDone = computed(() => st.value?.daily.filter(g => g.now >= g.goal).length ?? 0)

  async function buy(it: ShopItem) {
    const s = await shop.buy(it.id)
    if (!s) return
    const toast = useToastStore()
    if (s.got) toast.ok(`В наборе: ${Object.entries(s.got).map(([k, n]) => `${itemName(k)} ×${n}`).join(', ')}`)
    else if (s.won) toast.ok(`В сундуке ${s.won} монеток`)
    else toast.ok(`Куплено: ${it.name}`)
    void loadLog()
  }
  async function turnOn(id: string) {
    if (await shop.use(id)) {
      useToastStore().ok(`Включено: ${itemName(id)}`)
      void loadLog()
    }
  }
  return { shop, st, coins, rows, kind, when, pct, isActive, goalText, dailyDone, buy, turnOn }
}
