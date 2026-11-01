<script setup lang="ts">
import { ICONS } from '@/lib/icons'

/** Иконка платформы по имени (см. `src/lib/icons.ts`). Размер 1.25em, встаёт в строку с текстом. */
defineProps<{ name: string }>()
</script>

<template>
  <img v-if="ICONS[name]" class="ic-img" :src="ICONS[name]" alt="" aria-hidden="true" draggable="false" />
</template>
