/**
 * Директива `v-count`: число плавно «досчитывает» до нового значения. Ставится на элемент, внутри которого только само число:
 * `<b v-count="n">{{ n }}</b>`. На сервере ничего не делает (число уже в разметке).
 */
import type { Directive } from 'vue'
import { countTo } from '@/lib/motion'

const num = (v: unknown) => Number(v)
const textOf = (el: HTMLElement) => (el.firstChild?.nodeType === 3 ? (el.firstChild as Text) : null)

export default defineNuxtPlugin(nuxtApp => {
  const dir: Directive<HTMLElement, number> & { getSSRProps: () => Record<string, never> } = {
    mounted(el, b) {
      ;(el as HTMLElement & { _cv?: number })._cv = num(b.value)
      // при оживлении готовой страницы число остаётся как есть; при переходе по сайту оно «набегает» от нуля
      const t = textOf(el)
      if (t && !nuxtApp.isHydrating) countTo(t, num(b.value), 0)
    },
    updated(el, b) {
      const box = el as HTMLElement & { _cv?: number }
      const to = num(b.value)
      const from = box._cv ?? to
      box._cv = to
      const t = textOf(el)
      if (t && from !== to) countTo(t, to, from)
    },
    getSSRProps: () => ({}),
  }
  nuxtApp.vueApp.directive('count', dir)
})
