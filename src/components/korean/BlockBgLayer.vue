<script setup lang="ts">
import type { BlockBg } from '@/composables/useBlockBg'

defineProps<{ bg: BlockBg | null; veil?: boolean }>()
</script>

<template>
  <div v-if="bg" class="bgl" :class="{ veil }" aria-hidden="true">
    <img :src="bg.src" alt="" draggable="false" :style="{ objectPosition: `${bg.x}% ${bg.y}%`, transform: `scale(${bg.zoom})`, transformOrigin: `${bg.x}% ${bg.y}%` }" />
  </div>
</template>

<style scoped>
.bgl { position: absolute; inset: 0; z-index: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
.bgl img { width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; }
/* лёгкая вуаль, чтобы белый текст читался на любой картинке */
.bgl.veil::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(45, 35, 100, .18), rgba(45, 35, 100, .38)); }
</style>
