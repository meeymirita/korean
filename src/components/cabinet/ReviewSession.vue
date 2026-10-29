<script setup lang="ts">
import { computed, ref } from 'vue'
import { makeTask, type Task } from '@/data/korean/tasks'
import type { Word } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const props = defineProps<{ words: Word[] }>()
const emit = defineEmits<{ done: [] }>()

const progress = useProgressStore()
const tasks = ref<Task[]>(
  props.words.map((w, i) => (Math.random() < 0.5 ? makeTask('tr', w, i) : makeTask('back', w, i)) ?? makeTask('tr', w, i)!).filter(Boolean),
)
const idx = ref(0)
const picked = ref<string | null>(null)
const results = ref<boolean[]>([])

const current = computed(() => tasks.value[idx.value])
const finished = computed(() => idx.value >= tasks.value.length)
const right = computed(() => results.value.filter(Boolean).length)

function answer(option: string) {
  const t = current.value
  if (!t || picked.value !== null) return
  picked.value = option
  const ok = option === t.answer
  results.value.push(ok)
  progress.record({ word: t.word, ok, source: 'review' })
}
function next() {
  idx.value++
  picked.value = null
}
</script>

<template>
  <div class="rs">
    <template v-if="!finished && current">
      <div class="rs-bar">
        <span>{{ idx + 1 }} из {{ tasks.length }}</span>
        <span>верно: {{ right }}</span>
      </div>
      <div class="rs-q" :class="{ ru: current.kind === 'back' }">{{ current.prompt }}</div>
      <div class="rs-sub">{{ current.kind === 'back' ? 'Выбери слово по-корейски' : 'Выбери перевод' }}</div>
      <div class="rs-opts">
        <button
          v-for="o in current.options"
          :key="o"
          class="rs-opt"
          :class="{ ok: picked !== null && o === current.answer, bad: picked === o && o !== current.answer }"
          :disabled="picked !== null"
          @click="answer(o)"
        >
          {{ o }}
        </button>
      </div>
      <button v-if="picked !== null" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
    </template>
    <div v-else class="rs-end">
      <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
      <p>{{ right === tasks.length ? '🌸 Всё верно!' : 'Слова, в которых были ошибки, вернутся в повторение.' }}</p>
      <button class="rs-start" @click="emit('done')">Готово</button>
    </div>
  </div>
</template>
