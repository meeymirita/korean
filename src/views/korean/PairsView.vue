<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { pairTasks } from '@/data/korean/pairs'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const tasks = ref(pairTasks(progress.data))
const again = () => (tasks.value = pairTasks(progress.data))
</script>

<template>
  <div class="wrap">
    <SectionHead id="pairs" />
    <p class="sub-note">Варианты ответа здесь похожи на верное слово: из той же темы или с теми же слогами. Сначала идут слова, в которых были ошибки.</p>
    <TaskSession :tasks="tasks" source="trainer" again-label="Ещё набор" @again="again">
      <template #after><RouterLink to="/korean/mistakes" class="qk-home">Мои ошибки</RouterLink></template>
    </TaskSession>
  </div>
</template>
