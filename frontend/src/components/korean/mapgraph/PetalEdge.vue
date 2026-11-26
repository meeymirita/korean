<script setup lang="ts">
import { computed } from 'vue'

/**
 * Стрелка между цветками: изогнутая дуга от края одного цветка к краю другого, с наконечником.
 * `seq` (порядок книги) розовая сплошная, `dep` («опирается на») фиолетовая пунктирная.
 */
const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  data?: { kind: 'seq' | 'dep'; bend: number; done: boolean }
}>()
const R = 36

const geo = computed(() => {
  const { sourceX: x1, sourceY: y1, targetX: x2, targetY: y2 } = props
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const bend = (props.data?.bend ?? 0.18) * len * (props.data?.kind === 'dep' ? 1.4 : 1)
  const mx = (x1 + x2) / 2 - uy * bend
  const my = (y1 + y2) / 2 + ux * bend
  // начало и конец отодвигаем от центра цветка по касательной дуги
  const sx = mx - x1
  const sy = my - y1
  const sl = Math.hypot(sx, sy) || 1
  const ex = x2 - mx
  const ey = y2 - my
  const el = Math.hypot(ex, ey) || 1
  const a = { x: x1 + (sx / sl) * R, y: y1 + (sy / sl) * R }
  const b = { x: x2 - (ex / el) * (R + 4), y: y2 - (ey / el) * (R + 4) }
  const ang = Math.atan2(ey, ex)
  const hd = 10
  const tip = `${b.x},${b.y} ${b.x - Math.cos(ang - 0.45) * hd},${b.y - Math.sin(ang - 0.45) * hd} ${b.x - Math.cos(ang + 0.45) * hd},${b.y - Math.sin(ang + 0.45) * hd}`
  return { d: `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`, tip, short: len < R * 2 + 6 }
})
</script>

<template>
  <g v-if="!geo.short" class="pe" :class="[data?.kind, { done: data?.done }]">
    <path :d="geo.d" class="line" />
    <path v-if="data?.kind === 'seq' && data?.done" :d="geo.d" class="flow" />
    <polygon :points="geo.tip" class="head" />
  </g>
</template>

<style scoped>
.line { fill: none; stroke-linecap: round; }
.head { stroke-linejoin: round; }
.seq .line { stroke: var(--arrow); stroke-width: 3.5; opacity: .85; }
.seq .head { fill: var(--arrow); stroke: var(--arrow); stroke-width: 1; }
.dep .line { stroke: var(--arrow2); stroke-width: 2.2; stroke-dasharray: 2 7; opacity: .8; }
.dep .head { fill: var(--arrow2); stroke: var(--arrow2); stroke-width: 1; opacity: .85; }
.flow { fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 2 16; opacity: .9; animation: run 1.1s linear infinite; }
@keyframes run { to { stroke-dashoffset: -18; } }
@media (prefers-reduced-motion: reduce) { .flow { animation: none; } }
.seq:not(.done) .line, .seq:not(.done) .head { opacity: .38; }
.dep:not(.done) .line, .dep:not(.done) .head { opacity: .35; }
</style>
