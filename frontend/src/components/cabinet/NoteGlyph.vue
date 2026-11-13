<script setup lang="ts">
/** Значки заметки: булавка (закреплена) и часы (есть напоминание). Рисуются цветом текста. */
defineProps<{ name: 'pin' | 'clock' }>()
</script>

<template>
  <svg class="ng" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'pin'"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /><path d="M12 14v7" /></template>
    <template v-else><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></template>
  </svg>
</template>

<style>
.ng { flex: none; vertical-align: -.125em; }
</style>
