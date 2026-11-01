import { defineStore } from 'pinia'
import { ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { dayKey, useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

export interface Goal {
  id: string
  name: string
  coins: number
  now: number
  goal: number
  paid: boolean
  text?: string
}
export interface ShopState {
  coins: number
  combo: number
  inv: Record<string, number>
  active: { shield: boolean; double: boolean }
  daily: Goal[]
  dailyAll: { coins: number; paid: boolean }
  week: Goal & { from: string }
  ach: Goal[]
  got?: Record<string, number>
  won?: number
}
export interface LogRow {
  t: number
  day: string
  kind: string
  amount: number
  reason: string
}

/** Магазин Юны: инвентарь и баланс приходят с сервера; покупка и использование — запросы владельца. */
export const useShopStore = defineStore('shop', () => {
  const progress = useProgressStore()
  const state = ref<ShopState | null>(null)
  const busy = ref(false)
  /** id предмета, который покупается или включается прямо сейчас (блокируется только его кнопка, остальные не мигают) */
  const pending = ref('')
  const headers = () => ({ Authorization: `Bearer ${progress.bearer}`, 'Content-Type': 'application/json' })

  function take(s: ShopState) {
    state.value = s
    progress.data.coins = s.coins
  }
  async function load() {
    if (progress.isGuest || !progress.unlocked) return
    try {
      const res = await fetchT(`/api/shop?day=${dayKey()}`, { headers: headers() })
      if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
      take((await res.json()) as ShopState)
    } catch (e) {
      useToastStore().error(errText(e))
    }
  }
  /** Запрос действия; возвращает новое состояние или null, если не вышло (плашка с причиной уже показана). */
  async function act(path: 'buy' | 'use', id: string): Promise<ShopState | null> {
    if (busy.value) return null
    busy.value = true
    pending.value = id
    try {
      const res = await fetchT(`/api/shop/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify({ id, day: dayKey() }) })
      if (!res.ok) throw new Error(res.status === 400 ? 'не получилось: не хватает монеток или предмета' : `ошибка сервера ${res.status}`)
      const s = (await res.json()) as ShopState
      take(s)
      return s
    } catch (e) {
      useToastStore().error(errText(e))
      return null
    } finally {
      busy.value = false
      pending.value = ''
    }
  }
  const buy = (id: string) => act('buy', id)
  const use = (id: string) => act('use', id)
  const count = (id: string) => state.value?.inv[id] ?? 0

  async function log(kind: string): Promise<LogRow[]> {
    try {
      const res = await fetchT(`/api/shop/log?kind=${encodeURIComponent(kind)}&limit=200`, { headers: headers() })
      return res.ok ? ((await res.json()) as LogRow[]) : []
    } catch {
      return []
    }
  }
  return { state, busy, pending, load, buy, use, count, log }
})
