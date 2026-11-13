<script setup lang="ts">
import { ref } from 'vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { posTasks } from '@/data/korean/part-of-speech'

/** «Определи часть речи»: слово и выбор: глагол, прилагательное или вопросительное слово; после ответа «почему» и пример. */
const tasks = ref(posTasks(15))
const again = () => (tasks.value = posTasks(15))
</script>

<template>
  <div class="wrap">
    <p class="ps-hint">Какая это часть речи? Пока три вида: глагол, прилагательное и вопросительное слово.</p>
    <TaskSession :tasks="tasks" source="trainer" mode="speech" again-label="Ещё набор" @again="again" />
  </div>
</template>

<style scoped>
.ps-hint { color: var(--muted); max-width: 560px; margin: 4px 0 14px; }
</style>
