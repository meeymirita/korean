<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { usePersisted } from '@/composables/usePersisted'
import { particleSets, particleTasks } from '@/data/korean/particles'

const sets = particleSets()
/** Выбранное правило: пусто — вперемешку. Помнится после обновления страницы. */
const rule = usePersisted('particles_rule', '', v => typeof v === 'string' && (v === '' || sets.some(s => s.id === v)))
const tasks = ref(particleTasks(rule.value))
const again = () => (tasks.value = particleTasks(rule.value))
const pick = (id: string) => {
  rule.value = id
  again()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="particles" :big="sets.length" />
    <div class="chips">
      <button class="chip" :class="{ on: !rule }" @click="pick('')">Вперемешку</button>
      <button v-for="s in sets" :key="s.id" class="chip" :class="{ on: rule === s.id }" :title="s.ru" @click="pick(s.id)">{{ s.ko }}</button>
    </div>
    <TaskSession :tasks="tasks" source="trainer" again-label="Ещё набор" @again="again">
      <template #after>
        <RouterLink :to="{ path: '/korean/grammar', query: rule ? { g: rule } : {} }" class="qk-home">{{ rule ? 'Открыть правило' : 'Вся грамматика' }}</RouterLink>
      </template>
    </TaskSession>
  </div>
</template>
