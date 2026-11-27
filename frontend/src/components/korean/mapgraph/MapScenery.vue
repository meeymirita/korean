<script setup lang="ts">
import { computed } from 'vue'

/**
 * Нарисованный кодом фон карты: лес. Зелёная поляна и холмы, синие реки между рядами островов, лиственные деревья и ёлки,
 * листья на траве. Лежит под графом в тех же координатах (двигается и приближается вместе с ним); всё детерминировано.
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
const spots = computed(() => Array.from({ length: 60 }, (_, i) => ({ x: rnd(i + 700) * props.w, y: rnd(i + 800) * props.h, r: 90 + rnd(i + 900) * 160, k: i % 3 })))
const trees = computed(() => Array.from({ length: 44 }, (_, i) => ({ x: rnd(i + 60) * props.w, y: props.h * 0.05 + rnd(i + 80) * props.h * 0.9, s: 0.7 + rnd(i + 100) * 0.9, pine: i % 3 === 0, tone: i % 3 })))
const leaves = computed(() => Array.from({ length: 240 }, (_, i) => ({ x: rnd(i + 200) * props.w, y: rnd(i + 300) * props.h, s: 0.5 + rnd(i + 400) * 0.9, a: rnd(i + 500) * 360, t: i % 4 })))
</script>

<template>
  <svg class="sc" :width="w" :height="h" :viewBox="`0 0 ${w} ${h}`" aria-hidden="true">
    <defs>
      <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--g1)" /><stop offset="1" stop-color="var(--g2)" /></linearGradient>
      <!-- лиственное дерево: ствол, три шапки и листики поверх -->
      <g id="tr">
        <ellipse cx="0" cy="84" rx="40" ry="9" class="shade" />
        <rect x="-6" y="30" width="12" height="54" rx="5" class="trunk" />
        <circle cx="-30" cy="34" r="26" class="c1" /><circle cx="30" cy="34" r="26" class="c1" /><circle cx="0" cy="14" r="36" class="c2" />
        <circle cx="-14" cy="2" r="18" class="c3" /><circle cx="18" cy="22" r="14" class="c3" />
        <path v-for="(l, i) in [[-24,20,-30],[8,-4,20],[26,30,50],[-4,36,-60],[-34,40,-10],[14,10,-40]]" :key="i" :transform="`translate(${l[0]} ${l[1]}) rotate(${l[2]})`" d="M0 0 C-6 -6 -6 -14 0 -18 C6 -14 6 -6 0 0Z" class="lf" />
      </g>
      <!-- ёлка -->
      <g id="pn">
        <ellipse cx="0" cy="90" rx="34" ry="8" class="shade" />
        <rect x="-5" y="66" width="10" height="24" rx="3" class="trunk" />
        <path d="M0 -34 L28 8 H-28Z" class="c2" /><path d="M0 -14 L34 34 H-34Z" class="c1" /><path d="M0 8 L40 66 H-40Z" class="c2" />
      </g>
      <path id="l0" d="M0 0 C-7 -6 -7 -16 0 -22 C7 -16 7 -6 0 0Z" />
    </defs>
    <rect :width="w" :height="h" fill="url(#grass)" />
    <circle v-for="(s, i) in spots" :key="'s' + i" :cx="s.x" :cy="s.y" :r="s.r" :class="'spot spot' + s.k" />
    <path v-for="(d, i) in hills" :key="'h' + i" :d="d" :class="'hill hill' + i" />
    <path :d="river" class="river-bank" />
    <path :d="river" class="river" />
    <path :d="river" class="river-flow" />
    <use v-for="(l, i) in leaves" :key="'l' + i" href="#l0" :class="'leaf leaf' + l.t" :transform="`translate(${l.x} ${l.y}) rotate(${l.a}) scale(${l.s})`" />
    <use v-for="(t, i) in trees" :key="'t' + i" :href="t.pine ? '#pn' : '#tr'" :class="'tone' + t.tone" :transform="`translate(${t.x} ${t.y}) scale(${t.s * 1.4})`" />
  </svg>
</template>

<style scoped>
.sc { display: block; --g1: #bfe3b0; --g2: #9fd18f; }
.spot0 { fill: #d3efc4; opacity: .3; } .spot1 { fill: #a9d899; opacity: .3; } .spot2 { fill: #c6e8a8; opacity: .25; }
.hill0 { fill: #8fc77d; } .hill1 { fill: #7bb869; } .hill2 { fill: #66a655; }
.river-bank { fill: none; stroke: #e9dcb4; stroke-width: 74; stroke-linecap: round; }
.river { fill: none; stroke: #4aa3f0; stroke-width: 56; stroke-linecap: round; }
.river-flow { fill: none; stroke: #fff; stroke-width: 3; stroke-dasharray: 4 30; stroke-linecap: round; opacity: .75; animation: flow 4s linear infinite; }
@keyframes flow { to { stroke-dashoffset: -68; } }
.shade { fill: #00000022; }
.trunk { fill: #8a5a3b; }
.c1 { fill: #4f9a4a; } .c2 { fill: #5fb35a; } .c3 { fill: #7ccb6b; }
.tone1 .c1 { fill: #3f8a52; } .tone1 .c2 { fill: #4da363; } .tone1 .c3 { fill: #6dbf7c; }
.tone2 .c1 { fill: #5f9a3c; } .tone2 .c2 { fill: #74b34c; } .tone2 .c3 { fill: #94cf63; }
.lf { fill: #a6e08f; opacity: .85; }
.leaf0 { fill: #78bd68; } .leaf1 { fill: #5aa65a; } .leaf2 { fill: #92cf72; } .leaf3 { fill: #6fb36b; }
.leaf { opacity: .6; }
@media (prefers-reduced-motion: reduce) { .river-flow { animation: none; } }
</style>
