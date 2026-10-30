<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import { quickTasks, QUICK_SIZE } from '@/data/korean/quick'
import type { Task } from '@/data/korean/tasks'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const tasks = ref<Task[]>(quickTasks(progress.data))
const idx = ref(0)
const picked = ref<string | null>(null)
const missed = ref<Task[]>([])
const right = ref(0)

const current = computed(() => tasks.value[idx.value])
const finished = computed(() => idx.value >= tasks.value.length)

function answer(option: string) {
  const t = current.value
  if (!t || picked.value !== null) return
  picked.value = option
  const ok = option === t.answer
  if (ok) right.value++
  else missed.value.push(t)
  progress.record({ word: t.word, ok, source: 'quick' })
}
function next() {
  idx.value++
  picked.value = null
}
function again() {
  tasks.value = quickTasks(progress.data)
  idx.value = 0
  picked.value = null
  missed.value = []
  right.value = 0
}

/** Клавиши: 1–4 выбирают вариант, Enter или → идёт дальше. */
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
  <div class="wrap">
    <SectionHead id="quick" />
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
        <button v-if="picked !== null" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
      </template>
      <div v-else class="rs-end">
        <div class="pg-v">{{ right }} <small>из {{ tasks.length || QUICK_SIZE }}</small></div>
        <p>{{ right === tasks.length ? '🌸 Всё верно!' : 'Слова с ошибками вернутся в повторение. Вот что не получилось:' }}</p>
        <ul v-if="missed.length" class="qk-miss">
          <li v-for="t in missed" :key="t.id"><span class="ko">{{ t.prompt }}</span> → <b class="ko">{{ t.answer }}</b></li>
        </ul>
        <div class="pg-btns">
          <button class="rs-start" @click="again">Ещё пять минут</button>
          <RouterLink to="/korean/home" class="qk-home">На главную раздела</RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
