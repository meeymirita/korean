<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import TaskSession from '@/components/korean/TaskSession.vue'
import { explainTasks } from '@/data/korean/translate-explain'

/** «Переведи и объясни»: выбор перевода предложения, после ответа разбор по словам и частицам и ссылки на карточки правил. */
const tasks = ref(explainTasks(15))
const again = () => (tasks.value = explainTasks(15))
</script>

<template>
  <div class="wrap">
    <p class="ex-hint">Выбери перевод корейского предложения. Ценность в разборе после ответа: из чего оно собрано и какие правила здесь работают.</p>
    <TaskSession :tasks="tasks" source="trainer" mode="explain" again-label="Ещё набор" @again="again">
      <template #after><RouterLink to="/korean/ref/sentences" class="qk-home">Все примеры с разбором</RouterLink></template>
    </TaskSession>
  </div>
</template>

<style scoped>
.ex-hint { color: var(--muted); max-width: 560px; margin: 4px 0 14px; }
</style>
