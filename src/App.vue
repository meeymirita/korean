<script setup lang="ts">
import { RouterView } from 'vue-router'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ToastHost from '@/components/ToastHost.vue'
import StudyTimer from '@/components/StudyTimer.vue'
</script>

<template>
  <RouterView />
  <StudyTimer />
  <ConfirmDialog />
  <ToastHost />
</template>
