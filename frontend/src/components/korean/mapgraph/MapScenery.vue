<script setup lang="ts">
import { computed } from 'vue'

/**
 * Нарисованный кодом фон карты: холмы, река между рядами островов, сакуры, облака.
 * Лежит под графом в тех же координатах (двигается и приближается вместе с ним); всё детерминировано, без случайного.
 */
const props = defineProps<{ w: number; h: number; rowsY: number[] }>()
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

/** Река ползёт змейкой между рядами островов. */
const river = computed(() => {
  const ys = props.rowsY
  if (ys.length < 2) return ''
  let d = ''
  const pts = ys.slice(0, -1).map((y, i) => (y + ys[i + 1]!) / 2)
  pts.forEach((y, i) => {
    const l = i % 2 === 0
    const x0 = l ? -60 : props.w + 60
    const x1 = l ? props.w + 60 : -60
    const m = props.w / 2
    d += `${i ? ' ' : ''}M${x0} ${y + 20} C${x0 + (x1 - x0) * 0.25} ${y - 70} ${m} ${y + 90} ${x1 - (x1 - x0) * 0.25} ${y - 30} S${x1} ${y + 10} ${x1} ${y}`
  })
  return d
})
const hills = computed(() => {
  const h = props.h
  const mk = (base: number, amp: number, k: number, off: number) => {
    let d = `M0 ${h}`
    for (let x = 0; x <= props.w; x += 120) d += ` L${x} ${base + Math.sin(x / k + off) * amp}`
    return d + ` L${props.w} ${h}Z`
  }
  return [mk(h - 260, 70, 260, 0), mk(h - 170, 60, 200, 2), mk(h - 90, 40, 170, 4)]
})
const clouds = computed(() => Array.from({ length: 9 }, (_, i) => ({ x: rnd(i) * props.w, y: 40 + rnd(i + 20) * (props.h * 0.35), s: 0.8 + rnd(i + 40) * 1.2 })))
const trees = computed(() => Array.from({ length: 16 }, (_, i) => ({ x: rnd(i + 60) * props.w, y: props.h * 0.15 + rnd(i + 80) * props.h * 0.75, s: 0.7 + rnd(i + 100) * 0.9 })))
const petals = computed(() => Array.from({ length: 70 }, (_, i) => ({ x: rnd(i + 200) * props.w, y: rnd(i + 300) * props.h, r: 6 + rnd(i + 400) * 10, a: rnd(i + 500) * 360 })))
</script>

<template>
  <svg class="sc" :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky1)" /><stop offset="1" stop-color="var(--sky2)" /></linearGradient>
      <path id="cl" d="M0 40 C-6 20 20 10 34 22 C42 0 78 0 86 24 C108 18 124 40 106 52 L12 52 C2 50 -2 46 0 40Z" />
      <g id="tr"><rect x="-4" y="30" width="8" height="48" rx="4" class="trunk" /><circle cx="0" cy="18" r="34" class="crown" /><circle cx="-26" cy="34" r="22" class="crown" /><circle cx="26" cy="34" r="22" class="crown" /><circle cx="-8" cy="6" r="14" class="crown2" /></g>
      <path id="pt" d="M0 0 C-7 -8 -6 -20 0 -26 C6 -20 7 -8 0 0Z" />
    </defs>
    <rect :width="w" :height="h" fill="url(#sky)" />
    <path v-for="(d, i) in hills" :key="'h' + i" :d="d" :class="'hill hill' + i" />
    <path :d="river" class="river-bed" />
    <path :d="river" class="river" />
    <path :d="river" class="river-flow" />
    <use v-for="(c, i) in clouds" :key="'c' + i" href="#cl" class="cloud" :transform="`translate(${c.x} ${c.y}) scale(${c.s * 1.6})`" />
    <use v-for="(t, i) in trees" :key="'t' + i" href="#tr" :transform="`translate(${t.x} ${t.y}) scale(${t.s * 1.4})`" />
    <use v-for="(p, i) in petals" :key="'p' + i" href="#pt" class="pet" :transform="`translate(${p.x} ${p.y}) rotate(${p.a}) scale(${p.r / 16})`" />
  </svg>
</template>

<style scoped>
.sc { display: block; --sky1: #e6defb; --sky2: #fff0f8; }
html[data-theme='dark'] .sc { --sky1: #1a1226; --sky2: #2a1a33; }
.hill0 { fill: #f7d9ec; } .hill1 { fill: #f1c7e3; } .hill2 { fill: #ebb5d9; }
html[data-theme='dark'] .hill0 { fill: #3a2340; } html[data-theme='dark'] .hill1 { fill: #432848; } html[data-theme='dark'] .hill2 { fill: #4d2d50; }
.river-bed { fill: none; stroke: #ffffffb0; stroke-width: 74; stroke-linecap: round; }
.river { fill: none; stroke: #bcd8ff; stroke-width: 56; stroke-linecap: round; }
html[data-theme='dark'] .river-bed { stroke: #ffffff18; } html[data-theme='dark'] .river { stroke: #3b4a8a; }
.river-flow { fill: none; stroke: #fff; stroke-width: 3; stroke-dasharray: 4 30; stroke-linecap: round; opacity: .7; animation: flow 4s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -68; } }
.cloud { fill: #fff; opacity: .75; }
html[data-theme='dark'] .cloud { fill: #ffffff14; }
.trunk { fill: #b98a9c; } .crown { fill: #ffc3df; } .crown2 { fill: #ffd9ea; }
html[data-theme='dark'] .trunk { fill: #6c4a5c; } html[data-theme='dark'] .crown { fill: #7a3e66; } html[data-theme='dark'] .crown2 { fill: #8c4a76; }
.pet { fill: #ff9fcb; opacity: .5; }
@media (prefers-reduced-motion: reduce) { .river-flow { animation: none; } }
</style>
