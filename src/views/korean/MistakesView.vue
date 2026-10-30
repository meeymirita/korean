<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { mistakeTasks, mistakeWords } from '@/data/mistakes'
import type { Task } from '@/data/korean/tasks'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const rows = computed(() => mistakeWords(progress.data))
const SHOW = 40
const all = ref(false)
const shown = computed(() => (all.value ? rows.value : rows.value.slice(0, SHOW)))

/** Тренировка: набор собирается по кнопке и не меняется, пока не нажмёшь «ещё раз», чтобы список не прыгал во время ответов. */
const tasks = ref<Task[] | null>(null)
const train = () => (tasks.value = mistakeTasks(progress.data))
const pct = (r: number) => Math.round(r * 100)
</script>

<template>
  <div class="wrap">
    <SectionHead id="mistakes" :big="rows.length" />

    <template v-if="rows.length">
      <div class="pg-btns">
        <button type="button" @click="train">{{ tasks ? 'Другой набор' : 'Потренировать эти слова' }}</button>
        <RouterLink to="/korean/cabinet?tab=repeat" class="qk-home">Повторение по расписанию</RouterLink>
      </div>
      <TaskSession v-if="tasks" :tasks="tasks" source="review" again-label="Ещё набор" @again="train" />

      <div class="tb mk-tb">
        <div class="row h"><span>Слово</span><span>Чтение</span><span>Перевод</span><span>Верно / неверно</span></div>
        <div v-for="m in shown" :key="m.word.n" class="row">
          <span class="k ko">{{ m.word.k }}<small v-if="m.learned" class="mk-ok" title="Сейчас выучено: три верных ответа подряд"> ✓</small></span>
          <span class="rd">{{ m.word.r }}</span>
          <span class="tr">{{ m.word.t }}</span>
          <span class="mk-n">{{ m.stat.ok }} / <b>{{ m.stat.bad }}</b> <small>({{ pct(m.rate) }}% ошибок)</small></span>
        </div>
      </div>
      <button v-if="!all && rows.length > SHOW" class="chip" @click="all = true">Показать все {{ rows.length }}</button>
    </template>
    <p v-else class="cb-empty">Ошибок пока нет. Ошибёшься в слове в игре, тренажёре или «Сегодня», и оно появится здесь.</p>
  </div>
</template>
