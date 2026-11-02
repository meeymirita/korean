<script setup lang="ts">
import { lastRefTab } from '@/data/korean/sections'

// последняя открытая вкладка справочника живёт в localStorage, поэтому адрес рисуется только в браузере (routeRules в nuxt.config.ts)
definePageMeta({ redirect: () => `/korean/ref/${lastRefTab()}` })
</script>

<template>
  <div />
</template>
