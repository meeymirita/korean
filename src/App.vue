<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import GlobalSearch from '@/components/GlobalSearch.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ToastHost from '@/components/ToastHost.vue'
import StudyTimer from '@/components/StudyTimer.vue'

const route = useRoute()
</script>

<template>
  <RouterView />
  <!-- в разделе корейского (/korean/…) кнопка и окно поиска есть в самом разделе -->
  <GlobalSearch v-if="!route.path.startsWith('/korean')" />
  <StudyTimer />
  <ConfirmDialog />
  <ToastHost />
</template>
