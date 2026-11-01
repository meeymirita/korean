<script setup lang="ts">
import { computed } from 'vue'
import { ICONS } from '@/lib/icons'
import type { Stage } from '@/data/garden'

/** Растение сада: нарисованные стадии `plant-seed|sprout|bud|bloom|wilted` из `src/assets/icons/`. «Хочет пить» — цветок. */
const props = defineProps<{ stage: Stage }>()
const src = computed(() => ICONS[`plant-${props.stage === 'thirsty' ? 'bloom' : props.stage}`])
</script>

<template>
  <img class="plant-ic" :src="src" alt="" aria-hidden="true" draggable="false" />
</template>

<style>
.plant-ic { display: block; width: 1em; height: 1em; object-fit: contain; pointer-events: none; }
</style>
