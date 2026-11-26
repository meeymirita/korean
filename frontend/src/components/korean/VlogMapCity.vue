<script setup lang="ts">
import { computed } from 'vue'
import { PLACES } from '@/data/korean/vlog-map'
import { PLACE_AT, SCENE_H, SCENE_W, buildingAt } from '@/data/korean/vlog-map-scene'

/**
 * Большая карта для «Карты мест», нарисованная кодом (векторная, чёткая при любом приближении): луга и сакуры, районы со зданиями-значками
 * мест (`vm-<значок>` из `vlog-map-art.ts`), извилистые дороги с мостами, река, море с пляжем, маяком и островами, декоративные горы и домики,
 * анимации (машины, самолёт, корабль, облака, птицы, дым, фонтан, качание деревьев). Всё детерминировано (без случайного), ничего не
 * записывается. Подписи и кнопки мест рисует `VlogMapScene.vue` поверх.
 */
const W = SCENE_W
const H = SCENE_H
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

type Pt = [number, number]
/** Гладкая кривая Катмулла-Рома через опорные точки, много мелких отрезков (нужна и для рисования, и для проверки «не стоит ли на дороге»). */
function spline(p: Pt[], steps = 12): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!
    const p1 = p[i]!
    const p2 = p[i + 1]!
    const p3 = p[Math.min(p.length - 1, i + 2)]!
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(p[p.length - 1]!)
  return out
}
const d = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(' ')
const near = (x: number, y: number, pts: Pt[], r: number) => pts.some(p => Math.abs(p[0] - x) < r && Math.abs(p[1] - y) < r && Math.hypot(p[0] - x, p[1] - y) < r)

// ——— дороги: опорные точки, по ним гладкие кривые ———
const mainRoad = spline([[-80, 548], [420, 552], [900, 545], [1300, 520], [1700, 512], [2100, 505], [2500, 525], [3280, 548]])
const lowRoad = spline([[-80, 1420], [500, 1400], [1000, 1415], [1450, 1395], [1900, 1410], [2300, 1430], [3280, 1410]])
const roads: { id: string; pts: Pt[]; w: number }[] = [
  { id: 'main', pts: mainRoad, w: 54 },
  { id: 'low', pts: lowRoad, w: 54 },
  { id: 'a', pts: spline([[470, 550], [520, 760], [430, 910], [480, 1080], [640, 1230], [780, 1330], [860, 1405]]), w: 40 },
  { id: 'b', pts: spline([[1255, 515], [1235, 700], [1240, 985], [1230, 1200], [1250, 1405]]), w: 40 },
  { id: 'c', pts: spline([[880, 548], [900, 700], [980, 860], [1100, 960], [1235, 985]]), w: 38 },
  { id: 'd', pts: spline([[1235, 985], [1500, 1000], [1700, 1015], [1870, 1000], [2120, 1030], [2480, 1030]]), w: 44 },
  { id: 'e', pts: spline([[2450, 515], [2480, 720], [2470, 880], [2480, 1030], [2490, 1250], [2440, 1425]]), w: 40 },
  { id: 'f', pts: spline([[1450, 1398], [1440, 1500], [1450, 1650], [1452, 1740]]), w: 38 },
  { id: 'g', pts: spline([[1960, 1410], [1950, 1520], [1965, 1700]]), w: 36 },
  { id: 'h', pts: spline([[860, 1410], [850, 1520], [860, 1660]]), w: 34 },
  { id: 'i', pts: spline([[330, 1090], [340, 1250], [330, 1420]]), w: 30 },
]
const allRoad = roads.flatMap(r => r.pts)
const plazas = [{ x: 1235, y: 985, r: 215, c: '#e6dfcd' }, { x: 2480, y: 1030, r: 190, c: '#d4d5e2' }, { x: 1452, y: 1745, r: 150, c: '#e9e1cf' }]

// ——— река и море ———
const riverPts = spline([[1830, -60], [1780, 200], [1880, 520], [1840, 800], [1740, 1100], [1800, 1350], [1960, 1540], [2240, 1670], [2440, 1760]], 14)
const sea: Pt[] = [[W + 20, 1450], [2950, 1470], [2700, 1530], [2520, 1630], [2400, 1740], [2350, 1860], [2330, H + 20], [W + 20, H + 20]]
const seaD = `M${sea.map(p => p.join(' ')).join(' L')}Z`
function inPoly(x: number, y: number, poly: Pt[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
/** Мосты там, где дороги пересекают реку: поворот по направлению реки. */
const bridges = (() => {
  const out: { x: number; y: number; a: number }[] = []
  for (const r of roads) {
    for (const p of r.pts) {
      const i = riverPts.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 8)
      if (i < 1 || i > riverPts.length - 2) continue
      const q = riverPts[i]!
      if (out.some(b => Math.hypot(b.x - q[0], b.y - q[1]) < 160)) continue
      const a = riverPts[i - 1]!
      const b = riverPts[i + 1]!
      out.push({ x: q[0], y: q[1], a: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI })
    }
  }
  return out
})()
const pond = { x: 1090, y: 1840, rx: 200, ry: 72 }

// ——— здания мест, декор и деревья ———
const buildings = PLACES.map(p => ({ p, b: buildingAt(p.id) })).sort((a, b) => a.b.y - b.b.y)
const boxes = PLACES.map(p => { const b = buildingAt(p.id); const a = PLACE_AT[p.id]!; return { x0: b.x - b.size * 0.62, x1: b.x + b.size * 0.62, y0: a.y - 40, y1: b.y + b.size * 0.52 } })
const hit = (x: number, y: number, r: number, list: { x0: number; x1: number; y0: number; y1: number }[]) => list.some(b => x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r)
const blockedBase = (x: number, y: number, r: number) =>
  hit(x, y, r, boxes) ||
  near(x, y, allRoad, 44 + r) ||
  near(x, y, riverPts, 52 + r) ||
  inPoly(x, y, sea) || inPoly(x + 50 + r, y, sea) || inPoly(x, y - 50 - r, sea) ||
  ((x - pond.x) / (pond.rx + r + 14)) ** 2 + ((y - pond.y) / (pond.ry + r + 14)) ** 2 < 1 ||
  plazas.some(pl => Math.hypot(pl.x - x, pl.y - y) < pl.r + r)

const fillerIcons = ['home', 'office', 'store', 'bookstore', 'clothes', 'bakery', 'home', 'store']
const fillerColors = ['#f0b04a', '#8a8fe8', '#4cc3b5', '#e88a6a', '#b58cf0', '#e8a959', '#ff86b0', '#6a9cf0']
const fillers = (() => {
  const out: { x: number; y: number; s: number; icon: string; c: string; box: { x0: number; x1: number; y0: number; y1: number } }[] = []
  let n = 0
  for (const r of roads.slice(0, 7)) {
    for (let i = 14; i < r.pts.length - 8 && out.length < 70; i += 17) {
      const p = r.pts[i]!
      const q = r.pts[i + 1]!
      const nx = -(q[1] - p[1])
      const ny = q[0] - p[0]
      const l = Math.hypot(nx, ny) || 1
      const side = n++ % 2 ? 1 : -1
      const off = r.w / 2 + 48
      const x = p[0] + (nx / l) * off * side
      const y = p[1] + (ny / l) * off * side
      const s = 66 + rnd(n * 7) * 22
      const box = { x0: x - s * 0.6, x1: x + s * 0.6, y0: y - s * 0.6, y1: y + s * 0.5 }
      if (blockedBase(x, y, s * 0.55) || out.some(o => Math.abs(o.x - x) < 90 && Math.abs(o.y - y) < 90)) continue
      out.push({ x, y, s, icon: fillerIcons[n % fillerIcons.length]!, c: fillerColors[(n * 3) % fillerColors.length]!, box })
    }
  }
  return out.sort((a, b) => a.y - b.y)
})()
const scenery = [
  { x: 150, y: 170, s: 260 }, { x: 3030, y: 200, s: 240 }, { x: 110, y: 1830, s: 230 }, { x: 3060, y: 110, s: 150 }, { x: 560, y: 90, s: 160 }, { x: 1990, y: 110, s: 190 },
]
const sceneryBoxes = scenery.map(m => ({ x0: m.x - m.s * 0.5, x1: m.x + m.s * 0.5, y0: m.y - m.s * 0.5, y1: m.y + m.s * 0.55 }))
const trees = (() => {
  const out: { x: number; y: number; s: number; sak: boolean }[] = []
  const fb = fillers.map(f => f.box)
  for (let i = 0; i < 7000 && out.length < 560; i++) {
    const x = 20 + rnd(i * 3 + 1) * (W - 40)
    const y = 30 + rnd(i * 3 + 2) * (H - 60)
    const s = 20 + rnd(i * 3 + 3) * 22
    if (blockedBase(x, y, s * 0.7) || hit(x, y, s * 0.7, fb) || hit(x, y, s * 0.5, sceneryBoxes)) continue
    out.push({ x, y, s, sak: rnd(i + 99) < 0.42 })
  }
  return out.sort((a, b) => a.y - b.y)
})()
const tufts = Array.from({ length: 240 }, (_, i) => ({ x: rnd(i + 11) * W, y: rnd(i + 12) * H, c: ['#ffffff', '#ffd1e3', '#fff3a8', '#e4d7ff'][i % 4]!, r: 3 + rnd(i + 13) * 3 })).filter(t => !inPoly(t.x, t.y, sea) && !near(t.x, t.y, allRoad, 40) && !near(t.x, t.y, riverPts, 50))
const patches = Array.from({ length: 46 }, (_, i) => ({ x: rnd(i + 31) * W, y: rnd(i + 32) * H, r: 160 + rnd(i + 33) * 300, k: i % 3 }))
const waves = Array.from({ length: 70 }, (_, i) => ({ x: 2330 + rnd(i + 300) * 900, y: 1450 + rnd(i + 400) * 570, w: 36 + rnd(i + 500) * 50, t: rnd(i + 600) * 6 })).filter(w => inPoly(w.x, w.y, sea) && inPoly(w.x - 40, w.y, sea))

// ——— движение (SMIL): машины по дорогам, самолёт, корабль, облака, птицы ———
const cars = [
  { r: 'main', dur: 90, begin: 0, c: '#ff6f91' }, { r: 'main', dur: 110, begin: -45, c: '#ffd23d' }, { r: 'main', dur: 75, begin: -20, c: '#4aa3f0' },
  { r: 'low', dur: 100, begin: -10, c: '#6ccf8f' }, { r: 'low', dur: 85, begin: -60, c: '#ff9a4d' }, { r: 'd', dur: 55, begin: -5, c: '#b58cf0' },
  { r: 'b', dur: 40, begin: -12, c: '#ff6f91' }, { r: 'e', dur: 45, begin: -20, c: '#4aa3f0' }, { r: 'c', dur: 38, begin: -7, c: '#6ccf8f' },
].map(c => ({ ...c, path: d(roads.find(r => r.id === c.r)!.pts) }))
const walkers = [{ r: 'a', dur: 160, begin: 0 }, { r: 'd', dur: 190, begin: -80 }, { r: 'main', dur: 260, begin: -120 }, { r: 'c', dur: 120, begin: -40 }, { r: 'i', dur: 90, begin: -30 }].map(w => ({ ...w, path: d(roads.find(r => r.id === w.r)!.pts) }))
const clouds = [
  { y: 260, dur: 210, s: 1.2, begin: 0 }, { y: 760, dur: 260, s: 1.6, begin: -90 }, { y: 1180, dur: 230, s: 1, begin: -150 }, { y: 1520, dur: 280, s: 1.4, begin: -40 }, { y: 460, dur: 300, s: 0.9, begin: -200 },
]
</script>

<template>
  <div class="city" aria-hidden="true">
  <svg class="cy-svg" :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`">
    <defs>
      <linearGradient id="cy-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6df78" /><stop offset=".5" stop-color="#84cf66" /><stop offset="1" stop-color="#6fc062" /></linearGradient>
      <linearGradient id="cy-sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cc7f6" /><stop offset="1" stop-color="#2d8fe0" /></linearGradient>
      <g id="cy-sak"><ellipse cx="0" cy="13" rx="15" ry="5" class="cy-sh" /><rect x="-2.4" y="1" width="4.8" height="13" rx="2" class="cy-trunk" /><circle cx="-8" cy="-2" r="10" class="p1" /><circle cx="8" cy="-2" r="10" class="p1" /><circle cx="0" cy="-10" r="12" class="p2" /><circle cx="-4" cy="-13" r="5" class="p3" /><circle cx="8" cy="-8" r="4" class="p3" /></g>
      <g id="cy-grn"><ellipse cx="0" cy="13" rx="14" ry="5" class="cy-sh" /><rect x="-2.4" y="1" width="4.8" height="13" rx="2" class="cy-trunk" /><circle cx="-8" cy="-1" r="10" class="g1" /><circle cx="8" cy="-1" r="10" class="g1" /><circle cx="0" cy="-9" r="12" class="g2" /><circle cx="-4" cy="-12" r="5" class="g3" /></g>
      <g id="cy-car"><rect x="-17" y="-9" width="34" height="18" rx="6" class="car-b" /><rect x="-3" y="-7" width="11" height="14" rx="3" class="car-w" /><circle cx="-11" cy="-9" r="3" class="car-t" /><circle cx="-11" cy="9" r="3" class="car-t" /><circle cx="11" cy="-9" r="3" class="car-t" /><circle cx="11" cy="9" r="3" class="car-t" /></g>
      <g id="cy-cloud"><ellipse cx="0" cy="0" rx="150" ry="42" /><ellipse cx="-90" cy="14" rx="90" ry="30" /><ellipse cx="100" cy="12" rx="100" ry="32" /><ellipse cx="20" cy="-30" rx="80" ry="34" /></g>
      <g id="cy-plane"><ellipse cx="0" cy="0" rx="46" ry="9" fill="#fff" /><path d="M-6 -4 L-30 -44 L-18 -44 L16 -4Z M-6 4 L-30 44 L-18 44 L16 4Z" fill="#e8eefc" /><path d="M-40 -2 L-52 -16 L-44 -16 L-30 -2Z" fill="#ff6f91" /><ellipse cx="30" cy="-1" rx="10" ry="4" fill="#9ec9ff" /></g>
      <g id="cy-bird"><path d="M-14 0 Q-7 -9 0 0 Q7 -9 14 0" fill="none" stroke="#3a3a55" stroke-width="3" stroke-linecap="round" /></g>
    </defs>

    <!-- земля -->
    <rect :width="W" :height="H" fill="url(#cy-grass)" />
    <circle v-for="(t, i) in patches" :key="'pt' + i" :cx="t.x" :cy="t.y" :r="t.r" :class="'cy-patch k' + t.k" />

    <!-- район: площади -->
    <g v-for="(pl, i) in plazas" :key="'pz' + i"><circle :cx="pl.x" :cy="pl.y" :r="pl.r + 14" class="cy-pz-rim" /><circle :cx="pl.x" :cy="pl.y" :r="pl.r" :fill="pl.c" /><circle :cx="pl.x" :cy="pl.y" :r="pl.r * 0.62" class="cy-pz-in" /></g>

    <!-- дороги -->
    <path v-for="r in roads" :key="'re' + r.id" :d="d(r.pts)" class="cy-road-edge" :style="{ strokeWidth: r.w + 10 + 'px' }" />
    <path v-for="r in roads" :key="'r' + r.id" :d="d(r.pts)" class="cy-road" :style="{ strokeWidth: r.w + 'px' }" />
    <path v-for="r in roads" :key="'rd' + r.id" :d="d(r.pts)" class="cy-dash" />

    <!-- вода -->
    <path :d="d(riverPts)" class="cy-river-bank" /><path :d="d(riverPts)" class="cy-river" />
    <path :d="seaD" class="cy-sand" /><path :d="seaD" fill="url(#cy-sea)" />
    <path v-for="(w, i) in waves" :key="'w' + i" :d="`M${w.x} ${w.y} q${w.w / 4} -9 ${w.w / 2} 0 t${w.w / 2} 0`" class="cy-wave" />
    <g v-for="(b, i) in bridges" :key="'br' + i" :transform="`translate(${b.x} ${b.y}) rotate(${b.a})`"><rect x="-34" y="-62" width="68" height="124" rx="10" class="cy-bridge" /><path d="M-34 -50 h68 M-34 50 h68" class="cy-rail" /></g>
    <ellipse :cx="pond.x" :cy="pond.y" :rx="pond.rx + 14" :ry="pond.ry + 12" class="cy-pond-rim" /><ellipse :cx="pond.x" :cy="pond.y" :rx="pond.rx" :ry="pond.ry" class="cy-pond" />
    <ellipse :cx="pond.x - 70" :cy="pond.y + 6" rx="26" ry="9" class="cy-lily" /><ellipse :cx="pond.x + 90" :cy="pond.y - 10" rx="20" ry="8" class="cy-lily" /><ellipse :cx="pond.x + 20" :cy="pond.y + 22" rx="16" ry="6" class="cy-lily" />

    <g class="cy-rocks"><path d="M2990 1850 q16 -70 78 -82 q54 8 80 82Z" /><path d="M2860 1990 q24 -46 66 -50 q42 8 56 50Z" /><path d="M2560 1820 q14 -40 48 -44 q34 6 44 44Z" /></g>
    <g class="cy-lh"><rect x="3040" y="1738" width="20" height="46" /><path d="M3040 1748 h20 M3040 1764 h20" /><rect x="3036" y="1726" width="28" height="13" /></g>
    <g class="cy-umb"><path d="M2335 1830 a34 26 0 0 1 68 0Z" class="u1" /><rect x="2367" y="1830" width="4" height="34" /><path d="M2352 1890 a30 22 0 0 1 60 0Z" class="u2" /><rect x="2380" y="1890" width="4" height="30" /></g>

    <!-- декор: горы и домики -->
    <use v-for="(m, i) in scenery" :key="'sm' + i" href="#vm-mountain" :x="m.x - m.s / 2" :y="m.y - m.s / 2" :width="m.s" :height="m.s" style="--ic: #6fa07a" />
    <use v-for="(f, i) in fillers" :key="'f' + i" :href="`#vm-${f.icon}`" :x="f.x - f.s / 2" :y="f.y - f.s / 2" :width="f.s" :height="f.s" :style="{ '--ic': f.c }" />

    <!-- цветочки -->
    <circle v-for="(t, i) in tufts" :key="'tf' + i" :cx="t.x" :cy="t.y" :r="t.r" :fill="t.c" opacity=".85" />

    <!-- деревья -->
    <g v-for="(t, i) in trees" :key="'t' + i" :transform="`translate(${t.x} ${t.y}) scale(${t.s / 14})`">
      <use :href="t.sak ? '#cy-sak' : '#cy-grn'" />
    </g>

    <!-- фонтан на главной площади и дым -->
    <g class="cy-fountain"><ellipse cx="1235" cy="995" rx="62" ry="26" class="fn-rim" /><ellipse cx="1235" cy="992" rx="52" ry="20" class="fn-water" /><path d="M1235 990 q-18 -64 0 -92 q18 28 0 92" class="spray" /><path d="M1215 992 q-8 -32 8 -50 M1255 992 q8 -32 -8 -50" class="spray s2" /></g>

    <!-- здания мест -->
    <use v-for="{ p, b } in buildings" :key="p.id" :href="`#vm-${p.icon}`" :x="b.x - b.size / 2" :y="b.y - b.size / 2" :width="b.size" :height="b.size" :style="{ '--ic': p.color }" />
    <g class="cy-smoke"><circle v-for="k in 3" :key="'sk' + k" :cx="buildingAt('bath').x - 6 + k * 6" :cy="buildingAt('bath').y - buildingAt('bath').size * 0.36" r="9" :style="{ animationDelay: -k * 0.9 + 's' }" /></g>
    <g class="cy-smoke"><circle v-for="k in 3" :key="'sh' + k" :cx="buildingAt('home').x + 30" :cy="buildingAt('home').y - buildingAt('home').size * 0.4" r="7" :style="{ animationDelay: -k * 1.1 + 's' }" /></g>

  </svg>

  <!-- движение: отдельные лёгкие слои (двигаются без перерисовки всей карты) -->
  <div class="mv">
    <div v-for="(c, i) in clouds" :key="'cl' + i" class="m-cloud" :style="{ top: c.y + 'px', animationDuration: c.dur + 's', animationDelay: c.begin + 's', '--s': c.s }">
      <svg viewBox="-170 -80 340 220" width="340" height="220"><use href="#cy-cloud" x="40" y="70" class="cl-sh" /><use href="#cy-cloud" class="cl-b" /></svg>
    </div>
    <div v-for="(c, i) in cars" :key="'car' + i" class="m-obj" :style="{ offsetPath: `path('${c.path}')`, animationDuration: c.dur + 's', animationDelay: c.begin + 's', '--car': c.c }">
      <svg viewBox="-20 -12 40 24" width="44" height="26"><use href="#cy-car" /></svg>
    </div>
    <div v-for="(w, i) in walkers" :key="'wk' + i" class="m-obj" :style="{ offsetPath: `path('${w.path}')`, animationDuration: w.dur + 's', animationDelay: w.begin + 's' }">
      <svg viewBox="-8 -8 16 16" width="16" height="16"><circle r="6" class="walker" /></svg>
    </div>
    <div class="m-obj m-boat" :style="{ offsetPath: `path('M2480 1960 C2700 1860 2950 1980 3140 1800')` }">
      <svg viewBox="-56 -40 112 70" width="112" height="70"><path d="M-46 0 H46 L34 20 H-34Z" class="hull" /><rect x="-26" y="-22" width="44" height="22" rx="5" class="cab" /><rect x="-14" y="-36" width="22" height="14" rx="3" class="cab" /></svg>
    </div>
    <div class="m-obj m-sail" :style="{ offsetPath: `path('M2600 1560 C2800 1620 3000 1560 3180 1620')` }">
      <svg viewBox="-34 -54 80 80" width="80" height="80"><path d="M0 -50 V0 H40Z" fill="#fff" stroke="#c9d6ee" stroke-width="2" /><path d="M-30 4 H42 L30 20 H-18Z" fill="#ff8fa8" /></svg>
    </div>
    <div class="m-obj m-plane" :style="{ offsetPath: `path('M-240 420 C900 60 2100 900 3440 560')` }">
      <svg viewBox="-60 -60 140 140" width="140" height="140"><ellipse cx="22" cy="40" rx="46" ry="10" fill="#00000026" /><use href="#cy-plane" /></svg>
    </div>
    <div v-for="i in 5" :key="'bd' + i" class="m-obj m-bird" :style="{ offsetPath: `path('M-100 ${300 + (i - 1) * 330} C800 ${150 + (i - 1) * 330} 1900 ${450 + (i - 1) * 330} 3300 ${260 + (i - 1) * 330}')`, animationDuration: (38 + i * 7) + 's', animationDelay: -(i - 1) * 9 + 's' }">
      <svg viewBox="-16 -12 32 20" width="32" height="20"><use href="#cy-bird" /></svg>
    </div>
  </div>
  </div>
</template>

<style scoped>
.city { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cy-svg { display: block; width: 100%; height: 100%; }
.mv { position: absolute; inset: 0; overflow: hidden; }
.m-obj { position: absolute; left: 0; top: 0; width: 0; height: 0; offset-rotate: auto; offset-distance: 0%; animation: m-go 90s linear infinite; will-change: offset-distance; }
.m-obj svg { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); overflow: visible; }
@keyframes m-go { to { offset-distance: 100%; } }
.m-boat, .m-sail { offset-rotate: 0deg; animation-duration: 70s; animation-direction: alternate; animation-timing-function: ease-in-out; }
.m-sail { animation-duration: 55s; }
.m-plane { animation-duration: 48s; }
.m-bird { animation-duration: 40s; }
.m-cloud { position: absolute; left: 0; width: 0; height: 0; animation: m-cl 220s linear infinite; will-change: transform; }
.m-cloud svg { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%) scale(var(--s, 1)); overflow: visible; }
@keyframes m-cl { from { transform: translateX(-500px); } to { transform: translateX(3700px); } }
.cy-patch.k0 { fill: #b7e88a; opacity: .35; } .cy-patch.k1 { fill: #6fbd5e; opacity: .28; } .cy-patch.k2 { fill: #c9ee9a; opacity: .3; }
.cy-pz-rim { fill: #bdb49a; } .cy-pz-in { fill: #f1ebdb; opacity: .7; }
.cy-road-edge { fill: none; stroke: #b4b2c8; stroke-linecap: round; stroke-linejoin: round; }
.cy-road { fill: none; stroke: #d9d7e6; stroke-linecap: round; stroke-linejoin: round; }
.cy-dash { fill: none; stroke: #fff; stroke-width: 3; stroke-dasharray: 18 16; opacity: .75; }
.cy-river-bank { fill: none; stroke: #f0e2b4; stroke-width: 96; stroke-linecap: round; stroke-linejoin: round; }
.cy-river { fill: none; stroke: #4fb4f0; stroke-width: 74; stroke-linecap: round; stroke-linejoin: round; }
.cy-sand { fill: none; stroke: #f3dca8; stroke-width: 56; stroke-linejoin: round; }
.cy-wave { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; opacity: .55; }
.cy-bridge { fill: #e2dccf; stroke: #b9b2a2; stroke-width: 3; } .cy-rail { stroke: #a79f8d; stroke-width: 6; }
.cy-pond-rim { fill: #b7a98a; } .cy-pond { fill: #5fc4f0; } .cy-lily { fill: #7ed07a; opacity: .9; }
.cy-rocks path { fill: #8d8fa3; stroke: #6f7188; stroke-width: 3; }
.cy-lh rect { fill: #fff; stroke: #c9c9d8; stroke-width: 2; } .cy-lh path { stroke: #e0574a; stroke-width: 7; } .cy-lh rect:last-child { fill: #e0574a; }
.cy-umb .u1 { fill: #ff8fb4; } .cy-umb .u2 { fill: #6fb7ff; } .cy-umb rect { fill: #8a6a4a; }
.cy-sh { fill: #00000024; } .cy-trunk { fill: #8a5a3b; }
.p1 { fill: #ffb7d5; } .p2 { fill: #ff9cc6; } .p3 { fill: #ffe2ee; }
.g1 { fill: #4fa84f; } .g2 { fill: #62bb58; } .g3 { fill: #86d073; }
.car-b { fill: var(--car, #ff6f91); stroke: #fff; stroke-width: 2; } .car-w { fill: #cfe8ff; } .car-t { fill: #3a3a55; }
.walker { fill: #ff7a59; stroke: #fff; stroke-width: 2; }
.cy-boat .hull { fill: #fff; stroke: #c9d6ee; stroke-width: 3; } .cy-boat .cab { fill: #ff8fa8; stroke: #fff; stroke-width: 2; }
.cl-b { fill: #fff; opacity: .72; } .cl-sh { fill: #1d3a1d; opacity: .1; }
.cy-fountain .fn-rim { fill: #cfc8b8; stroke: #a89f8a; stroke-width: 3; } .cy-fountain .fn-water { fill: #6fcdf5; }
.spray { fill: #ffffffcc; transform-box: fill-box; transform-origin: 50% 100%; animation: cy-sp 1.5s ease-in-out infinite alternate; } .spray.s2 { animation-duration: 1.1s; }
@keyframes cy-sp { from { transform: scaleY(.7); opacity: .6; } to { transform: scaleY(1.08); opacity: 1; } }
.cy-smoke circle { fill: #fff; opacity: 0; animation: cy-smk 3.2s ease-out infinite; }
@keyframes cy-smk { 0% { transform: translate(0, 0) scale(.5); opacity: .8; } 100% { transform: translate(14px, -70px) scale(2); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .mv { display: none; } .spray, .cy-smoke circle { animation: none; } }
</style>
