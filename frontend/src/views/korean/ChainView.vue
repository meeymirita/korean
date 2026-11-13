<script setup lang="ts">
import { ref } from 'vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { chainTasks } from '@/data/korean/chain'

/** «Цепочки слов» (по мотивам 끝말잇기): выбери слово, которое начинается с последнего слога опорного; верное становится следующим опорным. */
const LINKS = 12
const tasks = ref(chainTasks(LINKS))
const again = () => (tasks.value = chainTasks(LINKS))
</script>

<template>
  <div class="wrap">
    <p class="ch-hint">Смотри на последний слог слова и выбери из четырёх слово, которое с него начинается. Верный ответ становится следующим словом цепочки. Слова только из твоего словаря.</p>
    <TaskSession :tasks="tasks" source="trainer" mode="chain" again-label="Новая цепочка" @again="again" />
  </div>
</template>

<style scoped>
.ch-hint { color: var(--muted); max-width: 560px; margin: 4px 0 14px; }
</style>
