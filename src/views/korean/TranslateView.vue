<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { usePersisted } from '@/composables/usePersisted'
import { TRANSLATE_DIRS, translateTasks, type TranslateDir } from '@/data/korean/translate'

const dir = usePersisted<TranslateDir>('translate_dir', 'mix', v => TRANSLATE_DIRS.some(d => d.id === v))
const tasks = ref(translateTasks(dir.value))
const again = () => (tasks.value = translateTasks(dir.value))
const pick = (d: TranslateDir) => {
  dir.value = d
  again()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="translate" />
    <div class="chips">
      <button v-for="d in TRANSLATE_DIRS" :key="d.id" class="chip" :class="{ on: dir === d.id }" @click="pick(d.id)">{{ d.label }}</button>
    </div>
    <TaskSession :tasks="tasks" source="trainer" again-label="Ещё набор" @again="again">
      <template #after><RouterLink to="/korean/ref/sentences" class="qk-home">Все примеры с разбором</RouterLink></template>
    </TaskSession>
  </div>
</template>
