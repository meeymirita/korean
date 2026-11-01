<script setup lang="ts">
import { computed } from 'vue'
import { ICONS } from '@/lib/icons'
import type { Stage } from '@/data/garden'

/**
 * Растение сада картинкой: росток и сакура из набора иконок, стадии и «вид цветка» отличаются цветом и размером (CSS-фильтры),
 * пока нет нарисованных стадий. `hue` — поворот цвета цветка (у каждой темы слов свой).
 */
const props = defineProps<{ stage: Stage; hue?: number }>()
const src = computed(() => (props.stage === 'seed' || props.stage === 'sprout' ? ICONS.sprout : ICONS.sakura))
const style = computed(() => {
  const h = props.hue ?? 0
  switch (props.stage) {
    case 'seed': return { filter: 'grayscale(.75) sepia(.55) brightness(.95)', transform: 'scale(.62)' }
    case 'sprout': return {}
    case 'bud': return { filter: 'saturate(.3) brightness(1.12)', transform: 'scale(.72)' }
    case 'wilted': return { filter: 'sepia(.9) saturate(.45) brightness(.75)', transform: 'scale(.85)' }
    default: return { filter: `hue-rotate(${h}deg)` }
  }
})
</script>

<template>
  <img class="plant-ic" :src="src" :style="style" alt="" aria-hidden="true" draggable="false" />
</template>

<style>
.plant-ic { display: block; width: 1em; height: 1em; object-fit: contain; pointer-events: none; }
</style>
