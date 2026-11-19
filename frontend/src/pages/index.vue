<script setup lang="ts">
import HomeView from '@/views/HomeView.vue'
import HomeLightView from '@/views/HomeLightView.vue'
import { themeLight } from '@/lib/theme'

/** Светлая тема показывает прежнюю главную, тёмные (розовая, ночная, тёмная) новую. Пока страница не ожила, themeLight = false: сервер и первая отрисовка одинаковы. */
</script>

<template>
  <HomeLightView v-if="themeLight" />
  <HomeView v-else />
</template>
