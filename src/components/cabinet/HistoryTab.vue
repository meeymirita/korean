<script setup lang="ts">
import { computed, ref } from 'vue'
import { D } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const shown = ref(50)
const byK = new Map(D.map(d => [d.k, d]))
const SRC: Record<string, string> = { game: 'Игра', trainer: 'Тренажёры', today: 'Сегодня', review: 'Повторение', quick: '5 минут' }

const rows = computed(() => progress.data.log.slice(0, shown.value))

function when(t: number) {
  const d = new Date(t)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === new Date().toDateString()) return `сегодня ${hm}`
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}
</script>

<template>
  <div class="cb-body">
    <div v-if="rows.length" class="hs-list">
      <div v-for="(r, i) in rows" :key="i" class="hs-row" :class="r.ok ? 'ok' : 'bad'">
        <span class="mk">{{ r.ok ? '✓' : '✗' }}</span>
        <span class="when">{{ when(r.t) }}</span>
        <span>
          <template v-if="r.w"><b>{{ r.w }}</b>{{ byK.get(r.w)?.t ?? '' }}</template>
          <template v-else>предложение</template>
        </span>
        <span class="src">{{ SRC[r.s] ?? r.s }}</span>
      </div>
    </div>
    <p v-else class="cb-empty">Здесь будут последние ответы: слово, верно или нет, где и когда.</p>
    <div v-if="progress.data.log.length > shown" class="pg-btns">
      <button class="plain" @click="shown += 50">Показать ещё</button>
    </div>
    <p v-if="progress.data.log.length" class="pg-note">Хранятся последние 300 ответов.</p>
  </div>
</template>
