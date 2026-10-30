<script setup lang="ts">
import { gsap } from 'gsap'
import { computed, onMounted, ref, watch } from 'vue'
import ChartTip from '@/components/charts/ChartTip.vue'
import { reducedMotion, useChartTip } from '@/composables/useChartTip'

/** Радар «где сильнее»: доля выученных слов по темам. Оси — темы, кольца — 25, 50, 75 и 100 %. */
const props = defineProps<{ items: { id: string; name: string; share: number; known: number; total: number }[]; title: string }>()
const S = 360
const C = S / 2
const R = 112
const box = ref<HTMLElement | null>(null)
const poly = ref<SVGPolygonElement | null>(null)
const { tip, show, hide } = useChartTip(box)
const color = '#7a63e8'

const n = computed(() => props.items.length)
const ang = (i: number) => -Math.PI / 2 + (i / n.value) * Math.PI * 2
const pt = (i: number, f: number) => ({ x: C + Math.cos(ang(i)) * R * f, y: C + Math.sin(ang(i)) * R * f })
const rings = [0.25, 0.5, 0.75, 1].map(f => ({ f, d: props.items.map((_, i) => `${i ? 'L' : 'M'}${pt(i, f).x.toFixed(1)},${pt(i, f).y.toFixed(1)}`).join(' ') + 'Z' }))
const shape = computed(() => props.items.map((it, i) => `${pt(i, Math.max(0.02, it.share)).x.toFixed(1)},${pt(i, Math.max(0.02, it.share)).y.toFixed(1)}`).join(' '))
const labels = computed(() =>
  props.items.map((it, i) => {
    const p = pt(i, 1.2)
    const c = Math.cos(ang(i))
    return { ...it, x: p.x, y: p.y + 4, anchor: Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end' }
  }),
)
const strongest = computed(() => [...props.items].sort((a, b) => b.share - a.share)[0])

function animate() {
  if (reducedMotion() || !poly.value) return
  gsap.fromTo(poly.value, { '--k': 0.05, opacity: 0 }, { '--k': 1, opacity: 1, duration: 0.9, ease: 'back.out(1.4)', clearProps: '--k,opacity' })
}
onMounted(animate)
watch(shape, animate, { flush: 'post' })
</script>

<template>
  <figure ref="box" class="ch ch-radar">
    <figcaption>{{ title }}</figcaption>
    <svg :viewBox="`0 0 ${S} ${S}`" role="img" :aria-label="`${title}. Сильнее всего: ${strongest?.name ?? '–'}`" @mouseleave="hide">
      <path v-for="r in rings" :key="r.f" :d="r.d" class="ch-ring" />
      <line v-for="(_, i) in items" :key="i" :x1="C" :y1="C" :x2="pt(i, 1).x" :y2="pt(i, 1).y" class="ch-grid" />
      <polygon ref="poly" :points="shape" :fill="color" fill-opacity=".2" :stroke="color" stroke-width="2" stroke-linejoin="round" />
      <circle v-for="(it, i) in items" :key="it.id" :cx="pt(i, Math.max(0.02, it.share)).x" :cy="pt(i, Math.max(0.02, it.share)).y" r="4" :fill="color" stroke="#fff" stroke-width="2" />
      <text v-for="l in labels" :key="l.id" :x="l.x" :y="l.y" :text-anchor="l.anchor" class="ch-ax ch-rl">{{ l.name }}</text>
      <circle v-for="(it, i) in items" :key="'h' + it.id" :cx="pt(i, 1).x" :cy="pt(i, 1).y" r="16" fill="transparent" @mousemove="show($event, it.name, [{ name: 'выучено', value: `${it.known} из ${it.total}`, color }])" />
    </svg>
    <ChartTip :tip="tip" />
    <details class="ch-table">
      <summary>Таблица</summary>
      <table><tbody><tr v-for="it in items" :key="it.id"><td>{{ it.name }}</td><td>{{ it.known }} из {{ it.total }} ({{ Math.round(it.share * 100) }}%)</td></tr></tbody></table>
    </details>
  </figure>
</template>
