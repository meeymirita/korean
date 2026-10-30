<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { errText } from '@/lib/http'
import { formatSize, useImagesStore } from '@/stores/images'
import { useToastStore } from '@/stores/toast'

const store = useImagesStore()
const toast = useToastStore()
const pct = computed(() => (store.limit ? Math.min(100, (store.used / store.limit) * 100) : 0))
/** Занято считается по всем файлам: галерея, вложения заметок, обложка кабинета. */
onMounted(async () => {
  if (store.loaded) return
  try {
    await store.load()
  } catch (e) {
    toast.error(errText(e))
  }
})
</script>

<template>
  <div class="st-block">
    <h3>Место для картинок</h3>
    <template v-if="store.loaded">
      <div class="im-usage">
        <div class="im-bar"><i :style="{ width: pct + '%' }"></i></div>
        <span>занято {{ formatSize(store.used) }} из {{ formatSize(store.limit) }}</span>
      </div>
      <p class="st-sub">В счёт входят все файлы: картинки из раздела «Картинки» ({{ store.items.length }} шт.), вложения заметок и обложка кабинета. Один файл до {{ formatSize(store.maxFile) }}.</p>
    </template>
    <p v-else class="st-sub">Считаю…</p>
  </div>
</template>
