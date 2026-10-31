<script setup lang="ts">
import { useRoute } from 'vue-router'
import '@/assets/sky.css'
import SearchWindow from '@/components/SearchWindow.vue'
import { openSearch } from '@/composables/useSearchWindow'

const route = useRoute()
</script>

<template>
  <!-- вне раздела корейского («О платформе», история, визитка): та же кнопка поиска справа вверху и то же окно (в игре кнопка стоит в её шапке рядом с «Сад» и «Словарь»); стили кнопки берутся от .study.sky -->
  <div v-if="route.path !== '/game'" class="study sky" :class="{ 'sw-home': route.path === '/about' }" style="display: contents">
    <button class="sw-btn" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" @click="openSearch()">
      <span class="ic">⌕</span><span class="t">Поиск</span><kbd>⌘K</kbd>
    </button>
  </div>
  <SearchWindow />
</template>

<style>
/* в «О платформе» в правом верхнем углу уже стоит кнопка «Платформа»: поиск ставим под строкой меню */
@media (min-width: 861px) {
  .study.sky.sw-home .sw-btn { top: 96px; right: 51px; }
}
</style>
