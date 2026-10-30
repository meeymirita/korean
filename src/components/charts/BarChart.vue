<script setup lang="ts">
import { gsap } from 'gsap'
import { computed, onMounted, ref, watch } from 'vue'
import ChartTip from '@/components/charts/ChartTip.vue'
import { reducedMotion, useChartTip } from '@/composables/useChartTip'
import type { Point } from '@/data/charts'

/** Столбики по дням: тонкие, с закруглённым верхом, подсказка при наведении, таблица под спойлером. */
const props = defineProps<{ points: Point[]; unit: string; color?: string; title: string }>()
const W = 600
const H = 210
const L = 34
const B = 28
const T = 14
const box = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const { tip, show, hide } = useChartTip(box)

/** Верх оси: ближайшее «круглое» число над максимумом. */
const top = computed(() => {
  const m = Math.max(4, ...props.points.map(p => p.value))
  const step = m <= 5 ? 1 : m <= 10 ? 2 : m <= 30 ? 5 : m <= 100 ? 20 : 50
  return Math.ceil(m / step) * step
})
const grid = computed(() => [0, 0.5, 1].map(f => ({ v: Math.round(top.value * f), y: H - B - f * (H - B - T) })))
const slot = computed(() => (W - L - 8) / props.points.length)
const bars = computed(() =>
  props.points.map((p, i) => {
    const h = (p.value / top.value) * (H - B - T)
    return { ...p, x: L + i * slot.value + slot.value * 0.2, w: slot.value * 0.6, h, y: H - B - h, cx: L + i * slot.value + slot.value / 2 }
  }),
)
const maxIdx = computed(() => (props.points.some(p => p.value > 0) ? props.points.reduce((m, p, i, a) => (p.value > a[m]!.value ? i : m), 0) : -1))
const every = computed(() => Math.ceil(props.points.length / 8))
const total = computed(() => props.points.reduce((n, p) => n + p.value, 0))
const col = computed(() => props.color ?? '#7a63e8')

/** Столбик с закруглением только сверху (4 px), основание ровное. */
const path = (b: { x: number; y: number; w: number; h: number }) => {
  if (b.h <= 0) return ''
  const r = Math.min(4, b.h, b.w / 2)
  return `M${b.x},${b.y + b.h} V${b.y + r} Q${b.x},${b.y} ${b.x + r},${b.y} H${b.x + b.w - r} Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + r} V${b.y + b.h} Z`
}

function animate() {
  if (reducedMotion() || !svg.value) return
  // масштаб считает CSS (.bar в cabinet.css), GSAP двигает только переменную: так у SVG не остаётся сдвига от transformOrigin
  gsap.fromTo(svg.value.querySelectorAll('.bar'), { '--k': 0 }, { '--k': 1, duration: 0.7, ease: 'power3.out', stagger: 0.025, clearProps: '--k' })
}
onMounted(animate)
watch(() => props.points.map(p => p.value).join(), animate, { flush: 'post' })
</script>

<template>
  <figure ref="box" class="ch">
    <figcaption>{{ title }}</figcaption>
    <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`${title}: всего ${total} ${unit}`" @mouseleave="hide">
      <g v-for="g in grid" :key="g.y">
        <line :x1="L" :x2="W - 8" :y1="g.y" :y2="g.y" class="ch-grid" />
        <text :x="L - 6" :y="g.y + 4" class="ch-ax" text-anchor="end">{{ g.v }}</text>
      </g>
      <g v-for="(b, i) in bars" :key="b.key">
        <path v-if="b.h > 0" class="bar" :d="path(b)" :fill="col" />
        <line v-else :x1="b.x" :x2="b.x + b.w" :y1="H - B - 1" :y2="H - B - 1" class="ch-zero" />
        <text v-if="i === maxIdx" :x="b.cx" :y="b.y - 5" class="ch-val" text-anchor="middle">{{ b.value }}</text>
        <text v-if="i % every === 0 || i === bars.length - 1" :x="b.cx" :y="H - 8" class="ch-ax" text-anchor="middle">{{ b.label }}</text>
        <rect :x="L + i * slot" :y="T" :width="slot" :height="H - B - T" fill="transparent" @mousemove="show($event, b.label, [{ name: unit, value: String(b.value), color: col }])" />
      </g>
    </svg>
    <ChartTip :tip="tip" />
    <details class="ch-table">
      <summary>Таблица</summary>
      <table><tbody><tr v-for="p in points" :key="p.key"><td>{{ p.label }}</td><td>{{ p.value }} {{ unit }}</td></tr></tbody></table>
    </details>
  </figure>
</template>
