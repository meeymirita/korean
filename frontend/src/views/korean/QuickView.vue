<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { QUICK_SIZES, quickTasks } from '@/data/korean/quick'
import { usePersisted } from '@/composables/usePersisted'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
/** Сколько заданий в подходе: 5, 10 или 15 (запоминается на время открытого окна). */
const size = usePersisted('quick_size', 10, v => (QUICK_SIZES as readonly number[]).includes(v as number))
const tasks = ref(quickTasks(progress.data, size.value))
const again = () => (tasks.value = quickTasks(progress.data, size.value))
const setSize = (n: number) => {
  size.value = n
  again()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="quick" />
    <div class="chips qk-size" role="group" aria-label="Сколько заданий">
      <button v-for="n in QUICK_SIZES" :key="n" type="button" class="chip" :class="{ on: size === n }" @click="setSize(n)">{{ n }} заданий</button>
    </div>
    <TaskSession :tasks="tasks" source="quick" mode="quick" again-label="Ещё пять минут" @again="again">
      <template #after><RouterLink to="/korean/home" class="qk-home">На главную раздела</RouterLink></template>
    </TaskSession>
  </div>
</template>
