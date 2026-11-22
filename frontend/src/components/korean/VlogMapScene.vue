<script setup lang="ts">
import { computed } from 'vue'
import { PLACES, type Place } from '@/data/korean/vlog-map'
import { ART, PETALS, PILLS, SCENE_H, SCENE_W, pinsFor } from '@/data/korean/vlog-map-scene'

/**
 * Сцена оформления 5: остров-картинка, плашки районов, декор и падающие лепестки (картинки нарезаны из набора владельца, `src/assets/vlogmap/`).
 * Всё состояние (наведение, выбор, счётчики) приходит от `VlogMap.vue`; здесь только рисунок и события. Только справка.
 */
const props = defineProps<{
  /** район, который сейчас под курсором или выбран (`shop`…) */
  active: string
  hoverId: string
  selId: string
  count: (id: string) => number
  faded: (p: Place) => boolean
}>()
const emit = defineEmits<{ hover: [id: string, e: MouseEvent | FocusEvent]; move: [e: MouseEvent]; leave: []; select: [id: string] }>()

const files = import.meta.glob('../../assets/vlogmap/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const urls = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.split('/').pop()!.replace('.webp', ''), v]))
const src = (n: string) => urls[n] ?? ''

// места выбранного района стоят под плашкой; для чеджу это одно место
const pins = computed(() => {
  const d = props.active
  if (!d) return []
  const list = PLACES.filter(p => p.district === d)
  return d === 'sea' ? [] : pinsFor(d, list)
})
const districtCount = (district: string) => PLACES.filter(p => p.district === district).reduce((n, p) => n + props.count(p.id), 0)
const pillCount = (key: string, target: string) => (target === 'sea' ? props.count('sea') : districtCount(key))
const isOn = (target: string) => props.hoverId === target || props.selId === target
</script>

<template>
  <div class="vs" :style="{ width: `${SCENE_W}px`, height: `${SCENE_H}px` }" role="group" aria-label="Карта мест: остров с районами">
    <div class="vs-sea" aria-hidden="true"></div>
    <img v-for="a in ART" :key="a.k" class="vs-art" :class="[`z${a.z}`, a.c]" :src="src(a.n)" alt="" draggable="false" :style="{ left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, '--t': a.t ?? 'none' }" />
    <span v-for="(p, i) in PETALS" :key="`p${i}`" class="vs-petal" aria-hidden="true" :style="{ left: `${p.x}px`, width: `${p.s}px`, height: `${p.s * 0.7}px`, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }"></span>

    <button v-for="pl in PILLS" :key="pl.key" type="button" class="vs-pill" :class="{ on: isOn(pl.target) || active === pl.district }" :style="{ left: `${pl.x}px`, top: `${pl.y}px` }"
      :aria-label="`${pl.ru}: показать влоги`" @mouseenter="emit('hover', pl.target, $event)" @mousemove="emit('move', $event)" @mouseleave="emit('leave')" @focus="emit('hover', pl.target, $event)" @blur="emit('leave')" @click.stop="emit('select', pl.target)">
      <img class="vs-pi" :src="src(pl.icon)" alt="" draggable="false" />
      <span class="vs-pt"><b lang="ko">{{ pl.ko }}</b><small>{{ pl.ru }}</small></span>
      <i v-if="pillCount(pl.key, pl.target)" class="vs-n">{{ pillCount(pl.key, pl.target) }}</i>
    </button>

    <button v-for="pin in pins" :key="pin.place.id" type="button" class="vs-pin" :class="{ on: isOn(pin.place.id), faded: faded(pin.place), none: !count(pin.place.id) }" :style="{ left: `${pin.x}px`, top: `${pin.y}px` }"
      :aria-label="`${pin.place.ru}: ${count(pin.place.id)}`" @mouseenter="emit('hover', pin.place.id, $event)" @mousemove="emit('move', $event)" @mouseleave="emit('leave')" @focus="emit('hover', pin.place.id, $event)" @blur="emit('leave')" @click.stop="emit('select', pin.place.id)">
      <img :src="src('pin_dot')" alt="" draggable="false" />
      <span><b lang="ko">{{ pin.place.ko }}</b><small>{{ pin.place.ru }}</small></span>
      <i v-if="count(pin.place.id)" class="vs-n">{{ count(pin.place.id) }}</i>
    </button>
  </div>
</template>

<style scoped>
.vs { position: relative; overflow: hidden; user-select: none; -webkit-user-select: none; }
.vs-sea { position: absolute; inset: 0; background:
  radial-gradient(ellipse at 20% 15%, rgba(255, 255, 255, .22), transparent 45%),
  radial-gradient(ellipse at 80% 85%, rgba(255, 190, 235, .2), transparent 50%),
  repeating-linear-gradient(176deg, rgba(255, 255, 255, .07) 0 3px, transparent 3px 46px),
  linear-gradient(170deg, #7d93e6, #6f8fe8 40%, #9a8be3 100%); }
.vs-art { position: absolute; height: auto; pointer-events: none; transform: var(--t); transform-origin: 50% 50%; }
.z1 { z-index: 1; } .z2 { z-index: 2; } .z3 { z-index: 3; } .z4 { z-index: 4; } .z5 { z-index: 5; } .z6 { z-index: 6; } .z7 { z-index: 7; } .z8 { z-index: 8; } .z9 { z-index: 9; }
.isl { filter: drop-shadow(0 18px 22px rgba(40, 40, 120, .35)); }
.drift { animation: vs-drift 40s ease-in-out infinite alternate; }
.drift2 { animation: vs-drift 55s ease-in-out infinite alternate-reverse; }
@keyframes vs-drift { to { translate: 90px 0; } }
.fly { animation: vs-fly 9s ease-in-out infinite alternate; }
.fly2 { animation: vs-fly 12s ease-in-out infinite alternate-reverse; }
@keyframes vs-fly { to { translate: 26px -12px; } }
.bob { animation: vs-bob 5s ease-in-out infinite; }
@keyframes vs-bob { 0%, 100% { translate: 0 0; rotate: -1deg; } 50% { translate: 8px -5px; rotate: 1.2deg; } }
.glow { animation: vs-glow 3.6s ease-in-out infinite; }
@keyframes vs-glow { 0%, 100% { filter: brightness(1) drop-shadow(0 0 10px rgba(255, 200, 120, .35)); } 50% { filter: brightness(1.12) drop-shadow(0 0 22px rgba(255, 200, 120, .7)); } }
.vs-petal { position: absolute; top: -30px; z-index: 10; border-radius: 80% 20% 80% 20%; background: radial-gradient(circle at 30% 30%, #ffe4f0, #ffb3d1); opacity: .85; pointer-events: none; animation: vs-fall linear infinite; }
@keyframes vs-fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 8% { opacity: .85; } 100% { transform: translate(180px, 980px) rotate(520deg); opacity: 0; } }

.vs-pill { position: absolute; z-index: 12; display: flex; align-items: center; gap: 10px; padding: 8px 20px 8px 14px; border: 2px solid rgba(255, 255, 255, .95); border-radius: 999px; background: linear-gradient(180deg, #fffaf5, #f7e9ec); color: #3a2a4a; font: inherit; cursor: pointer; transform: translate(-50%, -50%); box-shadow: 0 5px 0 rgba(150, 110, 150, .28), 0 12px 22px rgba(60, 40, 100, .28); transition: transform .25s cubic-bezier(.3, 1.6, .5, 1), box-shadow .25s; text-align: left; white-space: nowrap; outline: none; }
.vs-pill:hover, .vs-pill.on, .vs-pill:focus-visible { transform: translate(-50%, -56%) scale(1.07); box-shadow: 0 8px 0 rgba(150, 110, 150, .3), 0 20px 28px rgba(60, 40, 100, .34), 0 0 0 4px rgba(255, 143, 190, .55); }
.vs-pi { width: 44px; height: 44px; object-fit: contain; flex: none; }
.vs-pt { display: grid; gap: 1px; }
.vs-pt b { font: 800 22px/1.05 'Noto Sans KR', 'Archivo', sans-serif; }
.vs-pt small { font: 700 11.5px/1.1 'Archivo', system-ui, sans-serif; letter-spacing: .07em; text-transform: uppercase; color: #6b5a78; }
.vs-n { position: absolute; top: -10px; right: -6px; min-width: 26px; height: 26px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: #ff6fa8; color: #fff; font: 800 14px/22px 'Archivo', sans-serif; text-align: center; border: 2px solid #fff; font-style: normal; }

.vs-pin { position: absolute; z-index: 13; display: grid; justify-items: center; gap: 2px; padding: 0; border: 0; background: transparent; color: #3a2a4a; font: inherit; cursor: pointer; transform: translate(-50%, 0); animation: vs-drop .45s cubic-bezier(.3, 1.6, .5, 1) both; outline: none; }
.vs-pin img { width: 38px; height: auto; filter: drop-shadow(0 6px 5px rgba(60, 40, 100, .4)); transition: transform .25s cubic-bezier(.3, 1.6, .5, 1); }
.vs-pin span { display: grid; padding: 3px 10px 4px; border-radius: 12px; background: rgba(255, 252, 248, .96); box-shadow: 0 4px 10px rgba(60, 40, 100, .28); white-space: nowrap; }
.vs-pin b { font: 800 15px/1.1 'Noto Sans KR', 'Archivo', sans-serif; }
.vs-pin small { font: 600 10.5px/1.1 'Archivo', sans-serif; color: #6b5a78; }
.vs-pin:hover img, .vs-pin.on img, .vs-pin:focus-visible img { transform: translateY(-6px) scale(1.18); }
.vs-pin.on span { box-shadow: 0 0 0 3px #ff8fbe, 0 6px 14px rgba(60, 40, 100, .3); }
.vs-pin.faded { opacity: .25; }
.vs-pin.none { filter: grayscale(.7); opacity: .75; }
.vs-pin .vs-n { top: 0; right: -8px; }
@keyframes vs-drop { from { opacity: 0; translate: 0 -24px; } to { opacity: 1; translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .drift, .drift2, .fly, .fly2, .bob, .glow, .vs-petal, .vs-pin { animation: none !important; } .vs-petal { display: none; } }
</style>
