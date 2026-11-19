<script setup lang="ts">
import { rankStart } from '@/data/levels'

/** Стикер звания по уровню: `src/assets/levels/rank-<первый уровень звания>.webp`, один на звание. */
import { themed } from '@/lib/themed'
const files = import.meta.glob(['../assets/levels/*.webp', '!../assets/levels/*-light.webp'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
defineProps<{ level: number }>()
const url = (level: number) => themed(files[`../assets/levels/rank-${rankStart(level)}.webp`])
</script>

<template>
  <img class="rank-pic" :src="url(level)" alt="" aria-hidden="true" draggable="false" loading="lazy" />
</template>

<style>
.rank-pic { display: block; flex: none; width: 64px; height: 64px; object-fit: contain; pointer-events: none; user-select: none; }
</style>
