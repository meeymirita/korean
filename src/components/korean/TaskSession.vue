<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExplainBox from '@/components/korean/ExplainBox.vue'
import { MOODS, type Mood } from '@/data/mood'
import type { Task } from '@/data/korean/tasks'
import { useProgressStore } from '@/stores/progress'

/**
 * Серия заданий по одному: вопрос, варианты (клавиши 1–9), «Дальше» (Enter или →), итог со списком ошибок.
 * Ответы пишутся в прогресс с источником `source`. Новый набор (смена `tasks`) начинает серию заново.
 */
const props = defineProps<{ tasks: Task[]; source: string; againLabel?: string }>()
const emit = defineEmits<{ again: [] }>()

const progress = useProgressStore()
const idx = ref(0)
const picked = ref<string | null>(null)
const missed = ref<Task[]>([])
const right = ref(0)
/** Отметка «как прошло»: одна на серию, после неё кнопки заменяются подтверждением. */
const moodSet = ref<Mood | null>(null)
function setMood(m: Mood) {
  if (moodSet.value) return
  moodSet.value = m
  progress.addMood(m)
}

const current = computed(() => props.tasks[idx.value])
const finished = computed(() => idx.value >= props.tasks.length)

watch(
  () => props.tasks,
  () => {
    idx.value = 0
    picked.value = null
    missed.value = []
    right.value = 0
    moodSet.value = null
  },
)

function answer(option: string) {
  const t = current.value
  if (!t || picked.value !== null) return
  picked.value = option
  const ok = option === t.answer
  if (ok) right.value++
  else missed.value.push(t)
  progress.record({ word: t.word, ok, source: props.source })
}
function next() {
  idx.value++
  picked.value = null
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const t = current.value
  if (!t) return
  if (picked.value === null && /^[1-9]$/.test(e.key)) {
    const o = t.options[Number(e.key) - 1]
    if (o) answer(o)
  } else if (picked.value !== null && (e.key === 'Enter' || e.key === 'ArrowRight')) {
    e.preventDefault()
    next()
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="rs">
    <template v-if="!finished && current">
      <div class="rs-bar">
        <span>{{ idx + 1 }} из {{ tasks.length }}</span>
        <span>верно: {{ right }}</span>
      </div>
      <div class="qk-prog" role="progressbar" :aria-valuenow="idx" aria-valuemin="0" :aria-valuemax="tasks.length"><i :style="{ width: (idx / tasks.length) * 100 + '%' }"></i></div>
      <div class="rs-sub">{{ current.title }}</div>
      <div class="rs-q" :class="{ ru: current.kind === 'back' }">{{ current.prompt }}</div>
      <div v-if="current.hint" class="rs-sub">{{ current.hint }}</div>
      <div class="rs-opts">
        <button
          v-for="(o, i) in current.options"
          :key="o"
          class="rs-opt"
          :class="{ ok: picked !== null && o === current.answer, bad: picked === o && o !== current.answer }"
          :disabled="picked !== null"
          @click="answer(o)"
        >
          <kbd>{{ i + 1 }}</kbd> {{ o }}
        </button>
      </div>
      <ExplainBox v-if="picked !== null && picked !== current.answer" :task="current" :picked="picked" />
      <button v-if="picked !== null" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
    </template>
    <div v-else class="rs-end">
      <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
      <p>{{ right === tasks.length ? '🌸 Всё верно!' : 'Слова с ошибками вернутся в повторение. Вот что не получилось:' }}</p>
      <ul v-if="missed.length" class="qk-miss">
        <li v-for="t in missed" :key="t.id"><span class="ko">{{ t.prompt }}</span> → <b class="ko">{{ t.answer }}</b></li>
      </ul>
      <div class="md" role="group" aria-label="Как прошло?">
        <template v-if="!moodSet">
          <span class="md-q">Как прошло?</span>
          <button v-for="m in MOODS" :key="m.id" type="button" class="md-b" @click="setMood(m.id)">{{ m.icon }} {{ m.label }}</button>
        </template>
        <span v-else class="md-q">Записано: {{ MOODS.find(m => m.id === moodSet)?.label.toLowerCase() }}</span>
      </div>
      <div class="pg-btns">
        <button class="rs-start" @click="emit('again')">{{ againLabel ?? 'Ещё раз' }}</button>
        <slot name="after" />
      </div>
    </div>
  </div>
</template>
