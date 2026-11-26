<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { GNode } from '@/data/korean/map-graph'
import { short } from '@/data/korean/map-graph'

/** Цветок-узел графа: цвет по состоянию (пройдено / следующая / впереди), подпись под ним. */
const props = defineProps<{ data: { n: GNode; delay: number } }>()
const PETAL = 'M0 0 C-7 -8 -6 -20 0 -26 C6 -20 7 -8 0 0Z'
const n = computed(() => props.data.n)
const scale = computed(() => (n.value.state === 'ahead' ? 0.62 : n.value.state === 'next' ? 1.15 : 1))
</script>

<template>
  <div class="fn" :class="n.state">
    <Handle type="target" :position="Position.Left" class="hd" />
    <Handle type="source" :position="Position.Right" class="hd" />
    <span v-if="n.state === 'next'" class="here">ты здесь</span>
    <svg viewBox="-34 -34 68 68" width="68" height="68" aria-hidden="true">
      <circle v-if="n.state === 'next'" class="ring" r="32" />
      <g class="bloom" :style="{ animationDelay: data.delay + 's' }">
        <path v-for="k in 5" :key="k" class="petal" :d="PETAL" :transform="`rotate(${(k - 1) * 72}) scale(${scale})`" />
        <circle class="core" :r="n.state === 'ahead' ? 3.5 : 5.5" />
      </g>
    </svg>
    <span class="lbl"><b>{{ short(n.g.ko) }}</b><small>{{ n.g.bk!.replace(/^1B /, '') }}</small></span>
  </div>
</template>

<style scoped>
.fn { position: relative; width: 68px; height: 68px; cursor: pointer; }
.hd { left: 50% !important; top: 50% !important; width: 1px; height: 1px; min-width: 0; border: 0; opacity: 0; pointer-events: none; transform: none; }
.petal { fill: var(--petal); stroke: var(--petal-line); stroke-width: 1.5; }
.core { fill: var(--core); }
.ahead .petal { fill: var(--bud); stroke: var(--bud-line); stroke-width: 1.2; }
.ahead .core { fill: var(--bud-line); }
.ring { fill: none; stroke: var(--gold); stroke-width: 3; stroke-dasharray: 4 6; transform-box: fill-box; transform-origin: center; animation: spin 14s linear infinite; }
.bloom { transform-box: fill-box; transform-origin: center; transform: scale(0) rotate(-60deg); animation: bloom .7s cubic-bezier(.2, 1.4, .4, 1) forwards; transition: transform .3s; }
.fn:hover .bloom { animation: none; transform: scale(1.18) rotate(18deg); }
.lbl { position: absolute; top: 66px; left: 50%; width: 104px; margin-left: -52px; text-align: center; line-height: 1.15; pointer-events: none; }
.lbl b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; width: fit-content; max-width: 100%; margin: 0 auto; padding: 1px 7px; border-radius: 9px; background: var(--lbl-bg); font-size: 13px; overflow-wrap: anywhere; color: var(--ink); }
.lbl small { display: block; width: fit-content; margin: 2px auto 0; padding: 0 6px; border-radius: 7px; background: var(--lbl-bg); font-size: 10px; color: var(--muted); }
.here { position: absolute; left: 50%; top: -30px; transform: translateX(-50%); padding: 2px 10px; border-radius: 99px; background: var(--gold); color: #5b3b00; font-size: 12px; font-weight: 700; white-space: nowrap; animation: hop 1.2s ease-in-out infinite; pointer-events: none; }
.here::after { content: ''; position: absolute; left: 50%; bottom: -5px; margin-left: -5px; border: 5px solid transparent; border-bottom: 0; border-top-color: var(--gold); }
@keyframes hop { 50% { transform: translateX(-50%) translateY(-6px); } }
.ahead .lbl { opacity: .65; }
.next .lbl b { color: var(--gold); }
@keyframes bloom { to { transform: scale(1) rotate(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .bloom, .ring, .here { animation: none; } .bloom { transform: none; } }
</style>
