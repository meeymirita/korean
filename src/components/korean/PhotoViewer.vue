<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

/** Просмотр фото на весь экран. Слой 300 (выше окна грамматики 50); Esc закрывает только фото, а не окно под ним. */
defineProps<{ src: string | null; alt?: string }>()
const emit = defineEmits<{ close: [] }>()
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopImmediatePropagation()
  emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div v-if="src" class="pv-back" role="dialog" aria-modal="true" :aria-label="alt || 'Фото'" @click="emit('close')">
      <img :src="src" :alt="alt || ''" class="pv-img" @click.stop />
      <button type="button" class="pv-x" aria-label="Закрыть фото" @click.stop="emit('close')">✕</button>
    </div>
  </Teleport>
</template>

<style>
.pv-back { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 24px; background: rgba(32, 38, 92, .6); backdrop-filter: blur(8px); cursor: zoom-out; }
.pv-img { max-width: min(1280px, 100%); max-height: 100%; border-radius: 18px; box-shadow: 0 30px 80px rgba(30, 36, 100, .45); cursor: default; }
.pv-x { position: absolute; top: 18px; right: 18px; width: 40px; height: 40px; font: inherit; color: #1e2350; background: #fff; border: 0; border-radius: 50%; box-shadow: 0 6px 18px rgba(30, 36, 100, .25); cursor: pointer; }
</style>
