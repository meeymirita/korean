<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { REF_TAB_KEY, refTabs } from '@/data/korean/sections'

const route = useRoute()
watch(
  () => route.path,
  path => {
    const id = path.split('/')[3]
    if (!refTabs.some(t => t.id === id)) return
    try {
      localStorage.setItem(REF_TAB_KEY, id!)
    } catch {
      /* без хранилища просто не запоминаем */
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <nav class="wrap ref-tabs chips" aria-label="Справочник">
      <RouterLink v-for="t in refTabs" :key="t.id" :to="`/korean/ref/${t.id}`" class="chip">{{ t.menu }}</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
