<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { EMOJI_ICON } from '@/lib/icons'

withDefaults(defineProps<{ avatar: string; size?: number }>(), { size: 36 })
</script>

<template>
  <span class="avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.55 + 'px' }">
    <img v-if="avatar.startsWith('data:image/')" :src="avatar" alt="" />
    <Icon v-else-if="EMOJI_ICON[avatar]" :name="EMOJI_ICON[avatar]!" />
    <template v-else>{{ avatar }}</template>
  </span>
</template>

<style>
.avatar { display: inline-grid; place-items: center; flex: none; overflow: hidden; border-radius: 50%; line-height: 1;
  background: rgba(143, 124, 240, .14); border: 1px solid rgba(143, 124, 240, .35); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
