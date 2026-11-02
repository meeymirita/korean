import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { SHORTCUT_ITEMS, SHORTCUT_LABELS } from '@/data/shortcuts'
import { checkCombo, comboLabel, isMac, type Combo } from '@/lib/shortcuts'
import { useProgressStore } from '@/stores/progress'

/**
 * Свои сочетания клавиш для пунктов меню и вкладок кабинета. Лежат в настройках прогресса (`settings.keys`): сохраняются на сервере
 * вместе с остальными настройками и одинаковы на всех устройствах. Гостю сервер их не сохраняет (до обновления страницы работают).
 */
export const useShortcutsStore = defineStore('shortcuts', () => {
  const progress = useProgressStore()
  const bindings = computed<Record<string, Combo>>(() => progress.data.settings.keys)
  /** идёт запись сочетания в «Настройках»: обычные сочетания в это время не срабатывают */
  const capturing = ref(false)

  /** Назначает сочетание пункту; возвращает текст ошибки или null. */
  function set(id: string, combo: Combo): string | null {
    const err = checkCombo(combo, id, bindings.value, SHORTCUT_LABELS)
    if (err) return err
    progress.setSettings({ keys: { ...bindings.value, [id]: combo } })
    return null
  }
  function clear(id: string) {
    const { [id]: _gone, ...rest } = bindings.value
    progress.setSettings({ keys: rest })
  }
  function reset() {
    progress.setSettings({ keys: {} })
  }

  const byCombo = computed(() => new Map(Object.entries(bindings.value).map(([id, c]) => [c, id])))
  /** Куда ведёт сочетание, если оно назначено. */
  function targetFor(combo: Combo): string | null {
    const id = byCombo.value.get(combo)
    return id ? (SHORTCUT_ITEMS.find(i => i.id === id)?.to ?? null) : null
  }

  /** Подпись сочетания пункта для подсказки рядом с ним («⌘G»), пусто если не назначено. */
  const labelOf = (id: string) => (bindings.value[id] ? comboLabel(bindings.value[id]!, isMac()) : '')

  return { bindings, capturing, set, clear, reset, targetFor, labelOf }
})
