<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { usePersisted } from '@/composables/usePersisted'
import { TRANSLATE_DIRS, TRANSLATE_LEVELS, translateTasks, type TranslateDir, type TranslateLevel } from '@/data/korean/translate'

const dir = usePersisted<TranslateDir>('translate_dir', 'mix', v => TRANSLATE_DIRS.some(d => d.id === v))
/** Уровень по длине предложения; помнится после обновления страницы. */
const level = usePersisted<TranslateLevel>('translate_level', 'any', v => TRANSLATE_LEVELS.some(l => l.id === v))
const tasks = ref(translateTasks(dir.value, 10, level.value))
const again = () => (tasks.value = translateTasks(dir.value, 10, level.value))
const pick = (d: TranslateDir) => {
  dir.value = d
  again()
}
const setLevel = (id: TranslateLevel) => {
  level.value = id
  again()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="translate" />
    <div class="chips">
      <button v-for="d in TRANSLATE_DIRS" :key="d.id" class="chip" :class="{ on: dir === d.id }" @click="pick(d.id)">{{ d.label }}</button>
    </div>
    <div class="chips">
      <button v-for="l in TRANSLATE_LEVELS" :key="l.id" class="chip" :class="{ on: level === l.id }" :title="l.hint" @click="setLevel(l.id)">{{ l.label }}</button>
    </div>
    <TaskSession :tasks="tasks" source="trainer" mode="translate" again-label="Ещё набор" @again="again">
      <template #after><RouterLink to="/korean/ref/sentences" class="qk-home">Все примеры с разбором</RouterLink></template>
    </TaskSession>
  </div>
</template>
