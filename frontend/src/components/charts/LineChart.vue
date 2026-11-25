<script setup lang="ts">
import { gsap } from 'gsap'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChartTip from '@/components/charts/ChartTip.vue'
import { reducedMotion, useChartTip } from '@/composables/useChartTip'

/** Линии по дням с подсказкой-перекрестием. Вторая серия рисуется поверх первой; у первой лёгкая заливка. */
export interface Series {
  name: string
  values: number[]
  color: string
}
const props = defineProps<{ labels: string[]; series: Series[]; title: string; unit: string }>()
const W = 600
const H = 210
const L = 34
const B = 28
const T = 14
const box = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)
const { tip, show, hide } = useChartTip(box)
const hover = ref(-1)

const top = computed(() => {
  const m = Math.max(4, ...props.series.flatMap(s => s.values))
  const step = m <= 5 ? 1 : m <= 10 ? 2 : m <= 30 ? 5 : m <= 100 ? 20 : 50
  return Math.ceil(m / step) * step
})
const n = computed(() => props.labels.length)
const xAt = (i: number) => L + (i / Math.max(1, n.value - 1)) * (W - L - 12)
const yAt = (v: number) => H - B - (v / top.value) * (H - B - T)
const grid = computed(() => [0, 0.5, 1].map(f => ({ v: Math.round(top.value * f), y: yAt(top.value * f) })))
const line = (s: Series) => s.values.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ')
const area = (s: Series) => `${line(s)} L${xAt(n.value - 1)},${H - B} L${xAt(0)},${H - B} Z`
const every = computed(() => Math.ceil(n.value / 7))

function move(e: MouseEvent) {
  const r = svg.value!.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * W
  const i = Math.min(n.value - 1, Math.max(0, Math.round(((x - L) / (W - L - 12)) * (n.value - 1))))
  hover.value = i
  show(e, props.labels[i]!, props.series.map(s => ({ name: s.name, value: `${s.values[i]} ${props.unit}`, color: s.color })))
}
function leave() {
  hover.value = -1
  hide()
}

async function animate() {
  await nextTick()
  if (reducedMotion() || !svg.value) return
  svg.value.querySelectorAll<SVGPathElement>('.ln').forEach((p, i) => {
    const len = p.getTotalLength()
    gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out', delay: i * 0.15, onComplete: () => p.removeAttribute('stroke-dasharray') })
  })
  gsap.fromTo(svg.value.querySelectorAll('.ar'), { opacity: 0 }, { opacity: 1, duration: 0.9, delay: 0.4 })
}
onMounted(animate)
watch(() => props.series.map(s => s.values.join()).join('|'), animate)
</script>

<template>
  <figure ref="box" class="ch">
    <figcaption>{{ title }}</figcaption>
    <div class="ch-legend"><span v-for="s in series" :key="s.name"><i :style="{ background: s.color }"></i>{{ s.name }}</span></div>
    <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="title" @mousemove="move" @mouseleave="leave">
      <g v-for="g in grid" :key="g.y">
        <line :x1="L" :x2="W - 12" :y1="g.y" :y2="g.y" class="ch-grid" />
        <text :x="L - 6" :y="g.y + 4" class="ch-ax" text-anchor="end">{{ g.v }}</text>
      </g>
      <path v-if="series[0]" class="ar" :d="area(series[0])" :fill="series[0].color" fill-opacity=".12" />
      <path v-for="s in series" :key="s.name" class="ln" :d="line(s)" fill="none" :stroke="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <template v-if="hover >= 0">
        <line :x1="xAt(hover)" :x2="xAt(hover)" :y1="T" :y2="H - B" class="ch-cross" />
        <circle v-for="s in series" :key="s.name" :cx="xAt(hover)" :cy="yAt(s.values[hover]!)" r="4.5" :fill="s.color" stroke="#fff" stroke-width="2" />
      </template>
      <text v-for="(l, i) in labels" v-show="i % every === 0 || i === n - 1" :key="l" :x="xAt(i)" :y="H - 8" class="ch-ax" :text-anchor="i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'">{{ l }}</text>
    </svg>
    <ChartTip :tip="tip" />
    <details class="ch-table">
      <summary>Таблица</summary>
      <table>
        <thead><tr><th></th><th v-for="s in series" :key="s.name">{{ s.name }}</th></tr></thead>
        <tbody><tr v-for="(l, i) in labels" :key="l"><td>{{ l }}</td><td v-for="s in series" :key="s.name">{{ s.values[i] }}</td></tr></tbody>
      </table>
    </details>
  </figure>
</template>
