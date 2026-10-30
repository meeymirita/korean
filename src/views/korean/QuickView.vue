<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { quickTasks } from '@/data/korean/quick'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const tasks = ref(quickTasks(progress.data))
const again = () => (tasks.value = quickTasks(progress.data))
</script>

<template>
  <div class="wrap">
    <SectionHead id="quick" />
    <TaskSession :tasks="tasks" source="quick" again-label="Ещё пять минут" @again="again">
      <template #after><RouterLink to="/korean/home" class="qk-home">На главную раздела</RouterLink></template>
    </TaskSession>
  </div>
</template>
