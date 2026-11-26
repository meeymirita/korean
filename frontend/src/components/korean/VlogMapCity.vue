<script setup lang="ts">
import { PLACES } from '@/data/korean/vlog-map'
import { PLACE_AT, SCENE_H, SCENE_W, buildingAt } from '@/data/korean/vlog-map-scene'

/**
 * Город для «Карты мест», нарисованный кодом (векторный, чёткий при любом приближении): горы и городской фон, зелёные холмы,
 * улицы и мосты, река, море с пляжем и маяком, пруд парка, сакуры и деревья, здания-значки мест (`vm-<значок>` из `vlog-map-art.ts`).
 * Всё детерминировано (без случайного), ничего не записывается. Подписи и кнопки рисует `VlogMapScene.vue` поверх.
 */
const W = SCENE_W
const H = SCENE_H
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

type Pt = [number, number]
const line = (f: (x: number) => number, x0: number, x1: number, step = 12): Pt[] => {
  const out: Pt[] = []
  for (let x = x0; x <= x1; x += step) out.push([x, f(x)])
  return out
}
const d = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')

const roadA = line(x => 350 + 10 * Math.sin(x / 170), -20, W + 20)
const roadB = line(x => 568 + 9 * Math.sin(x / 150 + 1), -20, W + 20)
const riverY = (x: number) => 622 + 16 * Math.sin(x / 190)
const river = line(riverY, 250, 1340)
const lane = (x: number, y0: number, y1: number): Pt[] => {
  const out: Pt[] = []
  for (let y = y0; y <= y1; y += 12) out.push([x + 8 * Math.sin((y - y0) / 55), y])
  return out
}
const lanes = [lane(318, 350, 568), lane(1066, 350, 568), lane(830, 568, 640), lane(520, 568, 760)]
const bridges = [830, 520].map(x => ({ x, y: riverY(x) }))

const sea: Pt[] = [[W + 10, 566], [1520, 580], [1395, 612], [1308, 668], [1255, 760], [1225, 860], [1195, H + 10], [W + 10, H + 10]]
const seaD = `M${sea.map(p => p.join(' ')).join(' L')}Z`
const inPoly = (x: number, y: number, poly: Pt[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const near = (x: number, y: number, pts: Pt[], r: number) => pts.some(p => Math.hypot(p[0] - x, p[1] - y) < r)

const mount = (base: number, amp: number, k: number, off: number) => {
  let s = `M0 ${H}`
  for (let x = 0; x <= W; x += 40) s += ` L${x} ${base + Math.sin(x / k + off) * amp + Math.sin(x / (k / 3) + off * 2) * amp * 0.25}`
  return `${s} L${W} ${H}Z`
}
const mountains = [{ d: mount(135, 42, 170, 0.6), c: '#a8bfe9' }, { d: mount(172, 30, 120, 2.2), c: '#8fbfae' }]
const skyline = Array.from({ length: 70 }, (_, i) => ({ x: i * 24 + rnd(i) * 14, w: 14 + rnd(i + 5) * 20, h: 24 + rnd(i + 9) * 52, c: i % 3 ? '#d3dcef' : '#e0e6f4' }))

const buildings = PLACES.map(p => ({ p, b: buildingAt(p.id) })).sort((a, b) => a.b.y - b.b.y)
const pondC = { x: 650, y: 862, rx: 135, ry: 44 }

const trees = (() => {
  const out: { x: number; y: number; s: number; sak: boolean }[] = []
  const boxes = PLACES.map(p => { const b = buildingAt(p.id); const a = PLACE_AT[p.id]!; return { x0: b.x - b.size * 0.55, x1: b.x + b.size * 0.55, y0: a.y - 30, y1: b.y + b.size * 0.5 } })
  for (let i = 0; i < 1400 && out.length < 270; i++) {
    const x = 10 + rnd(i * 3 + 1) * (W - 20)
    const y = 205 + rnd(i * 3 + 2) * (H - 215)
    const s = 15 + rnd(i * 3 + 3) * 17
    if (boxes.some(b => x > b.x0 - s && x < b.x1 + s && y > b.y0 - s && y < b.y1 + s)) continue
    if (near(x, y, roadA, 30 + s * 0.4) || near(x, y, roadB, 30 + s * 0.4) || near(x, y, river, 38 + s * 0.4) || lanes.some(l => near(x, y, l, 20 + s * 0.4))) continue
    if (inPoly(x, y, sea) || inPoly(x + 36, y, sea)) continue
    if (((x - pondC.x) / (pondC.rx + s)) ** 2 + ((y - pondC.y) / (pondC.ry + s)) ** 2 < 1) continue
    out.push({ x, y, s, sak: rnd(i + 99) < 0.45 })
  }
  return out.sort((a, b) => a.y - b.y)
})()
const waves = Array.from({ length: 36 }, (_, i) => ({ x: 1230 + rnd(i + 300) * 440, y: 600 + rnd(i + 400) * 330, w: 22 + rnd(i + 500) * 28 })).filter(w => inPoly(w.x, w.y, sea) && inPoly(w.x - 30, w.y, sea))
</script>

<template>
  <svg class="city" :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" aria-hidden="true">
    <defs>
      <linearGradient id="cy-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb4f2" /><stop offset=".55" stop-color="#bfe0fb" /><stop offset="1" stop-color="#e8f4ff" /></linearGradient>
      <linearGradient id="cy-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fdc74" /><stop offset=".6" stop-color="#72c15f" /><stop offset="1" stop-color="#58a850" /></linearGradient>
      <linearGradient id="cy-sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#58c3f5" /><stop offset="1" stop-color="#2d8fe0" /></linearGradient>
      <g id="cy-sak"><ellipse cx="0" cy="13" rx="15" ry="5" class="cy-sh" /><rect x="-2.4" y="1" width="4.8" height="13" rx="2" class="cy-trunk" /><circle cx="-8" cy="-2" r="10" class="p1" /><circle cx="8" cy="-2" r="10" class="p1" /><circle cx="0" cy="-10" r="12" class="p2" /><circle cx="-4" cy="-13" r="5" class="p3" /><circle cx="8" cy="-8" r="4" class="p3" /></g>
      <g id="cy-grn"><ellipse cx="0" cy="13" rx="14" ry="5" class="cy-sh" /><rect x="-2.4" y="1" width="4.8" height="13" rx="2" class="cy-trunk" /><circle cx="-8" cy="-1" r="10" class="g1" /><circle cx="8" cy="-1" r="10" class="g1" /><circle cx="0" cy="-9" r="12" class="g2" /><circle cx="-4" cy="-12" r="5" class="g3" /></g>
    </defs>

    <rect :width="W" :height="H" fill="url(#cy-sky)" />
    <ellipse cx="300" cy="62" rx="90" ry="22" class="cy-cloud" /><ellipse cx="380" cy="52" rx="60" ry="20" class="cy-cloud" />
    <ellipse cx="880" cy="48" rx="100" ry="22" class="cy-cloud" /><ellipse cx="1490" cy="70" rx="85" ry="20" class="cy-cloud" /><ellipse cx="1540" cy="58" rx="55" ry="17" class="cy-cloud" />
    <path v-for="(m, i) in mountains" :key="'m' + i" :d="m.d" :fill="m.c" />
    <rect v-for="(b, i) in skyline" :key="'s' + i" :x="b.x" :y="190 - b.h" :width="b.w" :height="b.h" :fill="b.c" opacity=".9" />
    <g class="cy-tower"><rect x="1226" y="40" width="5" height="120" /><ellipse cx="1228.5" cy="68" rx="14" ry="6" /><rect x="1214" y="62" width="30" height="3" /><path d="M1222 160 L1228.5 120 L1235 160Z" /></g>
    <rect x="0" y="168" :width="W" :height="H - 168" fill="url(#cy-grass)" />
    <ellipse cx="140" cy="790" rx="190" ry="120" class="cy-hill" /><path d="M60 880 q60 -70 110 -120 q50 -50 70 -120" class="cy-trail" />

    <path :d="d(roadA)" class="cy-road-edge" /><path :d="d(roadB)" class="cy-road-edge" />
    <path v-for="(l, i) in lanes" :key="'le' + i" :d="d(l)" class="cy-lane-edge" />
    <path :d="d(roadA)" class="cy-road" /><path :d="d(roadB)" class="cy-road" />
    <path v-for="(l, i) in lanes" :key="'l' + i" :d="d(l)" class="cy-lane" />
    <path :d="d(roadA)" class="cy-dash" /><path :d="d(roadB)" class="cy-dash" />

    <path :d="d(river)" class="cy-river-bank" /><path :d="d(river)" class="cy-river" /><path :d="d(river)" class="cy-flow" />
    <path :d="seaD" class="cy-sand" /><path :d="seaD" fill="url(#cy-sea)" />
    <path v-for="(w, i) in waves" :key="'w' + i" :d="`M${w.x} ${w.y} q${w.w / 4} -6 ${w.w / 2} 0 t${w.w / 2} 0`" class="cy-wave" />
    <g v-for="(b, i) in bridges" :key="'b' + i"><rect :x="b.x - 30" :y="b.y - 36" width="60" height="72" rx="8" class="cy-bridge" /><path :d="`M${b.x - 30} ${b.y - 28} h60 M${b.x - 30} ${b.y + 28} h60`" class="cy-rail" /></g>

    <ellipse :cx="pondC.x" :cy="pondC.y" :rx="pondC.rx + 10" :ry="pondC.ry + 8" class="cy-pond-rim" /><ellipse :cx="pondC.x" :cy="pondC.y" :rx="pondC.rx" :ry="pondC.ry" class="cy-pond" />
    <ellipse :cx="pondC.x - 40" :cy="pondC.y + 4" rx="16" ry="6" class="cy-lily" /><ellipse :cx="pondC.x + 55" :cy="pondC.y - 6" rx="12" ry="5" class="cy-lily" />
    <path :d="`M${pondC.x} ${pondC.y - 6} q-10 -34 0 -48 q10 14 0 48`" class="cy-spray" />

    <g class="cy-rocks"><path d="M1560 880 q12 -50 56 -58 q40 6 58 58Z" /><path d="M1500 935 q18 -34 50 -36 q30 6 40 36Z" /></g>
    <g class="cy-lh"><rect x="1604" y="798" width="14" height="34" /><path d="M1604 805 h14 M1604 816 h14" /><rect x="1601" y="790" width="20" height="9" /></g>
    <g class="cy-boat"><path d="M1330 872 H1410 L1396 892 H1344Z" class="hull" /><rect x="1352" y="850" width="40" height="22" rx="4" class="cab" /><rect x="1362" y="838" width="20" height="12" rx="3" class="cab" /></g>
    <g class="cy-umb"><path d="M1196 818 a26 20 0 0 1 52 0Z" class="u1" /><rect x="1220" y="818" width="3" height="26" /><path d="M1236 858 a22 17 0 0 1 44 0Z" class="u2" /><rect x="1256" y="858" width="3" height="22" /></g>

    <use v-for="(t, i) in trees" :key="'t' + i" :href="t.sak ? '#cy-sak' : '#cy-grn'" :transform="`translate(${t.x} ${t.y}) scale(${t.s / 14})`" />

    <use v-for="{ p, b } in buildings" :key="p.id" :href="`#vm-${p.icon}`" :x="b.x - b.size / 2" :y="b.y - b.size / 2" :width="b.size" :height="b.size" :style="{ '--ic': p.color }" />
  </svg>
</template>

<style scoped>
.city { display: block; position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cy-cloud { fill: #fff; opacity: .85; }
.cy-tower rect, .cy-tower ellipse, .cy-tower path { fill: #f4f4fb; stroke: #b9bfd8; stroke-width: 1.5; }
.cy-hill { fill: #86cf6a; opacity: .9; } .cy-trail { fill: none; stroke: #e6d6a8; stroke-width: 5; stroke-dasharray: 3 9; stroke-linecap: round; }
.cy-road-edge { fill: none; stroke: #b4b2c8; stroke-width: 54; stroke-linecap: round; }
.cy-road { fill: none; stroke: #d6d4e4; stroke-width: 46; stroke-linecap: round; }
.cy-lane-edge { fill: none; stroke: #b4b2c8; stroke-width: 32; stroke-linecap: round; }
.cy-lane { fill: none; stroke: #d6d4e4; stroke-width: 26; stroke-linecap: round; }
.cy-dash { fill: none; stroke: #fff; stroke-width: 3; stroke-dasharray: 16 14; opacity: .8; }
.cy-river-bank { fill: none; stroke: #f0e2b4; stroke-width: 62; stroke-linecap: round; }
.cy-river { fill: none; stroke: #4fb4f0; stroke-width: 46; stroke-linecap: round; }
.cy-flow { fill: none; stroke: #fff; stroke-width: 2.5; stroke-dasharray: 4 26; stroke-linecap: round; opacity: .75; animation: cy-run 4s linear infinite; }
@keyframes cy-run { to { stroke-dashoffset: -60; } }
.cy-sand { fill: none; stroke: #f3dca8; stroke-width: 34; stroke-linejoin: round; }
.cy-wave { fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; opacity: .55; }
.cy-bridge { fill: #e2dccf; stroke: #b9b2a2; stroke-width: 2.5; } .cy-rail { stroke: #a79f8d; stroke-width: 4; }
.cy-pond-rim { fill: #b7a98a; } .cy-pond { fill: #5fc4f0; } .cy-lily { fill: #7ed07a; opacity: .9; }
.cy-spray { fill: #fff; opacity: .85; }
.cy-rocks path { fill: #8d8fa3; stroke: #6f7188; stroke-width: 2; }
.cy-lh rect { fill: #fff; stroke: #c9c9d8; stroke-width: 1.5; } .cy-lh path { stroke: #e0574a; stroke-width: 5; }
.cy-lh rect:last-child { fill: #e0574a; }
.cy-boat .hull { fill: #fff; stroke: #c9d6ee; stroke-width: 2; } .cy-boat .cab { fill: #ff8fa8; stroke: #fff; stroke-width: 1.5; }
.cy-boat { animation: cy-bob 5s ease-in-out infinite; }
@keyframes cy-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
.cy-umb .u1 { fill: #ff8fb4; } .cy-umb .u2 { fill: #6fb7ff; } .cy-umb rect { fill: #8a6a4a; }
.cy-sh { fill: #00000024; } .cy-trunk { fill: #8a5a3b; }
.p1 { fill: #ffb7d5; } .p2 { fill: #ff9cc6; } .p3 { fill: #ffe2ee; }
.g1 { fill: #4fa84f; } .g2 { fill: #62bb58; } .g3 { fill: #86d073; }
@media (prefers-reduced-motion: reduce) { .cy-flow, .cy-boat { animation: none; } }
</style>
