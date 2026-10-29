<script setup lang="ts">
withDefaults(defineProps<{ avatar: string; size?: number }>(), { size: 36 })
</script>

<template>
  <span class="avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.55 + 'px' }">
    <img v-if="avatar.startsWith('data:image/')" :src="avatar" alt="" />
    <template v-else>{{ avatar }}</template>
  </span>
</template>

<style>
.avatar { display: inline-grid; place-items: center; flex: none; overflow: hidden; border-radius: 50%; line-height: 1;
  background: rgba(168, 130, 47, .14); border: 1px solid rgba(168, 130, 47, .35); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
