<script setup lang="ts">
import NotFoundView from '@/views/NotFoundView.vue'

// неизвестный адрес: страница «такого нет» с настоящим кодом 404 (для роботов)
if (import.meta.server) setResponseStatus(useRequestEvent()!, 404)
</script>

<template>
  <NotFoundView />
</template>
