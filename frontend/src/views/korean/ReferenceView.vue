<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
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
    <!-- вкладки не анимируются при переходе: при смене вкладки появляется только содержимое -->
    <nav class="wrap ref-tabs chips" data-no-motion aria-label="Справочник">
      <RouterLink v-for="t in refTabs" :key="t.id" :to="`/korean/ref/${t.id}`" class="chip">{{ t.menu }}</RouterLink>
    </nav>
    <NuxtPage />
  </div>
</template>
