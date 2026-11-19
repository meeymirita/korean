<script setup lang="ts">
import { ref, watch } from 'vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { readTasks, sceneTasks } from '@/data/korean/read'

/** «Чтение и диалоги»: рассказ с вопросом по смыслу или короткая сценка, где нужно ответить собеседнику. Две серии на `TaskSession`. */
type Kind = 'stories' | 'dialogs'
const kind = useQueryParam<Kind>('kind', 'stories', ['stories', 'dialogs'])
const make = () => (kind.value === 'stories' ? readTasks(8) : sceneTasks(2))
const tasks = ref(make())
const again = () => (tasks.value = make())
watch(kind, again)
</script>

<template>
  <div class="wrap">
    <div class="rd-tabs" role="tablist" aria-label="Что читать">
      <button type="button" role="tab" :aria-selected="kind === 'stories'" :class="{ on: kind === 'stories' }" @click="kind = 'stories'">Рассказы</button>
      <button type="button" role="tab" :aria-selected="kind === 'dialogs'" :class="{ on: kind === 'dialogs' }" @click="kind = 'dialogs'">Диалоги</button>
    </div>
    <p class="rd-hint">
      <template v-if="kind === 'stories'">Прочитай рассказ и ответь на вопрос по смыслу. После ответа виден разбор нужного предложения и его перевод.</template>
      <template v-else>Собеседник задаёт вопрос, выбери подходящий ответ. Прошлые реплики сценки видны над вопросом.</template>
    </p>
    <TaskSession :key="kind" :tasks="tasks" source="trainer" mode="read" again-label="Ещё набор" @again="again" />
  </div>
</template>

<style scoped>
.rd-tabs { display: flex; gap: 8px; margin: 4px 0 10px; }
.rd-tabs button { padding: 8px 20px; font: inherit; font-size: 14px; font-weight: 600; color: var(--muted); cursor: pointer; background: transparent; border: 1px solid var(--line); border-radius: 999px; }
.rd-tabs button.on { color: #fff; background: var(--accent); border-color: var(--accent); }
.rd-hint { max-width: 620px; margin: 0 0 14px; color: var(--muted); }
</style>
