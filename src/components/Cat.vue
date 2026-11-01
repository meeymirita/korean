<script setup lang="ts">
/** Котик-стикер по имени из `src/assets/cats/` (`cat-happy|sad|think|read|water|cheer.webp`): для пустых экранов и итогов. */
const files = import.meta.glob('../assets/cats/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
defineProps<{ name: 'happy' | 'sad' | 'think' | 'read' | 'water' | 'cheer' }>()
const url = (n: string) => files[`../assets/cats/cat-${n}.webp`]
</script>

<template>
  <img class="cat-img" :src="url(name)" alt="" aria-hidden="true" draggable="false" />
</template>

<style>
.cat-img { display: block; height: 130px; width: auto; max-width: 100%; margin: 0 auto 6px; object-fit: contain; pointer-events: none; user-select: none; }
</style>
