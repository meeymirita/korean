import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'ok' | 'error' | 'info'
export interface Toast {
  id: number
  kind: ToastKind
  text: string
}

const MAX = 4
const LIFETIME: Record<ToastKind, number> = { ok: 3200, info: 3600, error: 5500 }

/** Плашки снизу слева после каждого действия: показываются в цвет платформы и сами исчезают. */
export const useToastStore = defineStore('toast', () => {
  const items = ref<Toast[]>([])
  let next = 1
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function dismiss(id: number) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    items.value = items.value.filter(t => t.id !== id)
  }

  function show(kind: ToastKind, text: string) {
    // одно и то же сообщение подряд не множим: старое просто живёт дальше
    if (items.value.some(t => t.kind === kind && t.text === text)) return
    const id = next++
    items.value.push({ id, kind, text })
    while (items.value.length > MAX) dismiss(items.value[0]!.id)
    timers.set(id, setTimeout(() => dismiss(id), LIFETIME[kind]))
  }

  return {
    items,
    show,
    dismiss,
    ok: (text: string) => show('ok', text),
    info: (text: string) => show('info', text),
    error: (text: string) => show('error', text),
  }
})
