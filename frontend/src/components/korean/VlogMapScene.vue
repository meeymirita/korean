<script setup lang="ts">
import { PLACES, type Place } from '@/data/korean/vlog-map'
import { PETALS, PLACE_AT, SCENE_H, SCENE_W } from '@/data/korean/vlog-map-scene'
import VlogMapCity from './VlogMapCity.vue'

/**
 * Сцена карты мест: картинка владельца и кликабельная точка на значке каждого места (число влогов в кружке, название при наведении).
 * Всё состояние (наведение, выбор, счётчики) приходит от `VlogMap.vue`; здесь только рисунок и события. Только справка.
 */
const props = defineProps<{
  hoverId: string
  selId: string
  count: (id: string) => number
  faded: (p: Place) => boolean
}>()
const emit = defineEmits<{ hover: [id: string, e: MouseEvent | FocusEvent]; move: [e: MouseEvent]; leave: []; select: [id: string] }>()
const isOn = (id: string) => props.hoverId === id || props.selId === id
</script>

<template>
  <div class="vs" :style="{ width: `${SCENE_W}px`, height: `${SCENE_H}px` }" role="group" aria-label="Карта мест: город со значками">
    <VlogMapCity />
    <span v-for="(p, i) in PETALS" :key="`p${i}`" class="vs-petal" aria-hidden="true" :style="{ left: `${p.x}px`, width: `${p.s}px`, height: `${p.s * 0.7}px`, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }"></span>

    <button
      v-for="pl in PLACES"
      :key="pl.id"
      type="button"
      class="vs-pin"
      :class="{ on: isOn(pl.id), faded: faded(pl), none: !count(pl.id)}"
      :style="{ left: `${PLACE_AT[pl.id]?.x ?? 0}px`, top: `${PLACE_AT[pl.id]?.y ?? 0}px`, '--pc': pl.color }"
      :aria-label="`${pl.ru}: ${count(pl.id)}`"
      @mouseenter="emit('hover', pl.id, $event)"
      @mousemove="emit('move', $event)"
      @mouseleave="emit('leave')"
      @focus="emit('hover', pl.id, $event)"
      @blur="emit('leave')"
      @click.stop="emit('select', pl.id)"
    >
      <svg class="vs-ic" viewBox="0 0 120 120" aria-hidden="true"><use :href="`#vm-${pl.icon}`" :style="{ '--ic': pl.color }" /></svg>
      <b lang="ko">{{ pl.ko }}</b>
      <i v-if="count(pl.id)" class="vs-n">{{ count(pl.id) }}</i>
    </button>
  </div>
</template>

<style scoped>
.vs { position: relative; overflow: hidden; user-select: none; -webkit-user-select: none; }
.vs-petal { position: absolute; top: -30px; z-index: 2; border-radius: 80% 20% 80% 20%; background: radial-gradient(circle at 30% 30%, #ffe4f0, #ffb3d1); opacity: .85; pointer-events: none; animation: vs-fall linear infinite; }
@keyframes vs-fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 8% { opacity: .85; } 100% { transform: translate(180px, 980px) rotate(520deg); opacity: 0; } }
.vs-pin { position: absolute; z-index: 5; display: flex; align-items: center; gap: 10px; height: 64px; padding: 0 26px 0 12px; border: 4px solid var(--pc, #ff6fa8); border-radius: 34px; background: rgba(255, 255, 255, .97); color: #3a2a4a; font: inherit; white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer; box-shadow: 0 8px 18px rgba(40, 50, 90, .32); transition: transform .2s cubic-bezier(.3, 1.6, .5, 1), box-shadow .2s; }
.vs-ic { width: 46px; height: 46px; flex: none; }
.vs-pin b { font: 800 27px/1 'Noto Sans KR', 'Archivo', sans-serif; }
.vs-pin:hover, .vs-pin.on, .vs-pin:focus-visible { transform: translate(-50%, -50%) scale(1.12); box-shadow: 0 0 0 6px #ff6fa8, 0 14px 30px rgba(40, 30, 90, .45); outline: none; z-index: 8; }
.vs-pin.faded { opacity: .15; }
.vs-n { position: absolute; top: -20px; right: -14px; min-width: 38px; height: 38px; padding: 0 10px; box-sizing: border-box; border-radius: 999px; background: #ff6fa8; color: #fff; font: 800 20px/32px 'Archivo', system-ui, sans-serif; text-align: center; border: 2px solid #fff; font-style: normal; box-shadow: 0 3px 8px rgba(60, 40, 100, .35); }
.vs-pin.none .vs-n { display: none; }
@media (prefers-reduced-motion: reduce) { .vs-petal { display: none; } .vs-pin { transition: none; } }
</style>
