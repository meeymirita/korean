<script setup lang="ts">
import DigestBlock from '@/components/cabinet/DigestBlock.vue'
import LessonBlock from '@/components/cabinet/LessonBlock.vue'
import ReminderBlock from '@/components/cabinet/ReminderBlock.vue'
import { useProgressStore } from '@/stores/progress'

/** Вкладка «Уведомления»: всё, что связано с почтой, в одном месте вместо нескольких блоков в «Настройках». */
const progress = useProgressStore()
</script>

<template>
  <div class="cb-body">
    <template v-if="progress.unlocked && !progress.isGuest">
      <ReminderBlock />
      <LessonBlock />
      <DigestBlock />
    </template>
    <p v-else class="cb-empty">Уведомления доступны после входа по токену владельца.</p>
  </div>
</template>
