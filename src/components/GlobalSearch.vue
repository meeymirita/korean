<script setup lang="ts">
import { useRoute } from 'vue-router'
import '@/assets/sky.css'
import SearchWindow from '@/components/SearchWindow.vue'
import { openSearch } from '@/composables/useSearchWindow'

const route = useRoute()
</script>

<template>
  <!-- вне раздела корейского (главная, «О платформе», игра, история): та же кнопка поиска справа вверху и то же окно; стили кнопки берутся от .study.sky -->
  <div class="study sky" :class="{ 'sw-home': route.path === '/about', 'sw-game': route.path === '/game' }" style="display: contents">
    <button class="sw-btn" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" @click="openSearch()">
      <span class="ic">⌕</span><span class="t">Поиск</span><kbd>⌘K</kbd>
    </button>
  </div>
  <SearchWindow />
</template>

<style>
/* в «О платформе» в правом верхнем углу уже стоит кнопка «Платформа»: поиск ставим под строкой меню; в игре правее заголовка стоят ссылки «Сад» и «Словарь», поиск левее них */
@media (min-width: 861px) {
  .study.sky.sw-home .sw-btn { top: 96px; right: 51px; }
  .study.sky.sw-game .sw-btn { right: 230px; }
}
</style>
