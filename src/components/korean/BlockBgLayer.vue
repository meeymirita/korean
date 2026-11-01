<script setup lang="ts">
import { computed } from 'vue'
import { NEUTRAL, placementStyle, type Placement } from '@/lib/siteImages'
import { useSiteImagesStore } from '@/stores/siteImages'

/** Картинка на фоне блока главной раздела. Своя подмена (режим редактирования) важнее стандартной `fallback`. */
const props = withDefaults(defineProps<{ id: string; fallback?: string; veil?: boolean; place?: Placement }>(), { place: () => ({ ...NEUTRAL }) })
const store = useSiteImagesStore()
const key = computed(() => 'block-' + props.id)
const o = computed(() => store.effective(key.value))
const src = computed(() => o.value?.src || props.fallback || '')
const style = computed(() => (o.value ? placementStyle(key.value, o.value) : placementStyle(key.value, props.place)))
</script>

<template>
  <div v-if="src" class="bgl" :class="{ veil }" aria-hidden="true">
    <img :src="src" alt="" draggable="false" :style="style" :data-si-key="key" data-si-own />
  </div>
</template>

<style scoped>
.bgl { position: absolute; inset: 0; z-index: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
.bgl img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; display: block; user-select: none; }
/* лёгкая вуаль, чтобы белый текст читался на любой картинке */
.bgl.veil::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(45, 35, 100, .18), rgba(45, 35, 100, .38)); }
</style>
