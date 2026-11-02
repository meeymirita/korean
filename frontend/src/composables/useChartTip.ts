import { ref, type Ref } from 'vue'

/** Подсказка графика: плавает за курсором внутри блока; позиция считается от блока, чтобы не вылезать за край. */
export function useChartTip(box: Ref<HTMLElement | null>) {
  const tip = ref({ show: false, x: 0, y: 0, title: '', rows: [] as { name: string; value: string; color?: string }[] })
  function show(e: MouseEvent | { clientX: number; clientY: number }, title: string, rows: { name: string; value: string; color?: string }[]) {
    const r = box.value?.getBoundingClientRect()
    if (!r) return
    const x = Math.min(Math.max(e.clientX - r.left, 70), Math.max(70, r.width - 70))
    tip.value = { show: true, x, y: e.clientY - r.top, title, rows }
  }
  const hide = () => (tip.value.show = false)
  return { tip, show, hide }
}

/** Анимации выключаются, если в системе включено «уменьшить движение». */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
