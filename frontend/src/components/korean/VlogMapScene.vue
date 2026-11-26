<script setup lang="ts">
import { PLACES, type Place } from '@/data/korean/vlog-map'
import { PETALS, PLACE_AT, SCENE_H, SCENE_W } from '@/data/korean/vlog-map-scene'
import sceneUrl from '@/assets/vlogmap/scene.webp'

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
    <img class="vs-bg" :src="sceneUrl" alt="" draggable="false" :width="SCENE_W" :height="SCENE_H" />
    <span v-for="(p, i) in PETALS" :key="`p${i}`" class="vs-petal" aria-hidden="true" :style="{ left: `${p.x}px`, width: `${p.s}px`, height: `${p.s * 0.7}px`, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }"></span>

    <button
      v-for="pl in PLACES"
      :key="pl.id"
      type="button"
      class="vs-pin"
      :class="{ on: isOn(pl.id), faded: faded(pl), none: !count(pl.id), nopic: PLACE_AT[pl.id]?.none }"
      :style="{ left: `${PLACE_AT[pl.id]?.x ?? 0}px`, top: `${PLACE_AT[pl.id]?.y ?? 0}px` }"
      :aria-label="`${pl.ru}: ${count(pl.id)}`"
      @mouseenter="emit('hover', pl.id, $event)"
      @mousemove="emit('move', $event)"
      @mouseleave="emit('leave')"
      @focus="emit('hover', pl.id, $event)"
      @blur="emit('leave')"
      @click.stop="emit('select', pl.id)"
    >
      <i v-if="count(pl.id)" class="vs-n">{{ count(pl.id) }}</i>
      <span v-if="isOn(pl.id) || PLACE_AT[pl.id]?.none" class="vs-name"><b lang="ko">{{ pl.ko }}</b><small>{{ pl.ru }}</small></span>
    </button>
  </div>
</template>

<style scoped>
.vs { position: relative; overflow: hidden; user-select: none; -webkit-user-select: none; }
.vs-bg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
.vs-petal { position: absolute; top: -30px; z-index: 2; border-radius: 80% 20% 80% 20%; background: radial-gradient(circle at 30% 30%, #ffe4f0, #ffb3d1); opacity: .85; pointer-events: none; animation: vs-fall linear infinite; }
@keyframes vs-fall { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 8% { opacity: .85; } 100% { transform: translate(180px, 980px) rotate(520deg); opacity: 0; } }
.vs-pin { position: absolute; z-index: 5; width: 62px; height: 62px; margin: -31px 0 0 -31px; padding: 0; border: 3px solid transparent; border-radius: 50%; background: transparent; color: #3a2a4a; font: inherit; cursor: pointer; transition: transform .2s cubic-bezier(.3, 1.6, .5, 1), border-color .2s, box-shadow .2s, background .2s; }
.vs-pin:hover, .vs-pin.on, .vs-pin:focus-visible { transform: scale(1.18); border-color: #fff; background: rgba(255, 255, 255, .22); box-shadow: 0 0 0 4px #ff6fa8, 0 10px 22px rgba(40, 30, 90, .4); outline: none; z-index: 8; }
.vs-pin.faded { opacity: .15; }
.vs-pin.nopic { border: 3px dashed #fff; background: rgba(255, 255, 255, .35); box-shadow: 0 4px 12px rgba(40, 30, 90, .35); }
.vs-n { position: absolute; top: -12px; right: -12px; min-width: 26px; height: 26px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: #ff6fa8; color: #fff; font: 800 14px/22px 'Archivo', system-ui, sans-serif; text-align: center; border: 2px solid #fff; font-style: normal; box-shadow: 0 3px 8px rgba(60, 40, 100, .35); }
.vs-pin.none .vs-n { display: none; }
.vs-name { position: absolute; left: 50%; top: 100%; display: grid; margin-top: 8px; padding: 3px 12px 4px; border-radius: 12px; background: rgba(255, 252, 248, .97); box-shadow: 0 4px 10px rgba(60, 40, 100, .32); white-space: nowrap; transform: translateX(-50%); pointer-events: none; }
.vs-name b { font: 800 16px/1.1 'Noto Sans KR', 'Archivo', sans-serif; }
.vs-name small { font: 600 11px/1.1 'Archivo', sans-serif; color: #6b5a78; }
@media (prefers-reduced-motion: reduce) { .vs-petal { display: none; } .vs-pin { transition: none; } }
</style>
