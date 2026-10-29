<script setup lang="ts">
import { computed } from 'vue'
import { weekSummary } from '@/data/review'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const week = computed(() => weekSummary(progress.data))
const max = computed(() => Math.max(1, ...week.value.days.map(d => d.all)))
</script>

<template>
  <div class="cb-body">
    <h2 class="today-h">Последние 7 дней</h2>
    <div class="wk-chart">
      <div v-for="(d, i) in week.days" :key="d.key" class="wk-col">
        <div class="wk-bars" :title="`${d.key}: ответов ${d.all}, верных ${d.ok}`">
          <i :style="{ height: (d.all / max) * 100 + '%' }"></i>
          <i class="ok" :style="{ height: (d.ok / max) * 100 + '%' }"></i>
        </div>
        <span class="wk-n">{{ d.all }}</span>
        <span class="wk-d" :class="{ today: i === 6 }">{{ d.label }}</span>
      </div>
    </div>
    <p class="pg-legend"><i class="learning"></i> всего ответов <i class="known"></i> верных</p>

    <div class="wk-stats">
      <div class="wk-stat"><b>{{ week.total }}</b><small>ответов за неделю</small></div>
      <div class="wk-stat"><b>{{ week.accuracy === null ? '–' : week.accuracy + '%' }}</b><small>верных ({{ week.ok }})</small></div>
      <div class="wk-stat"><b>{{ week.activeDays }} / 7</b><small>дней с занятиями</small></div>
      <div class="wk-stat">
        <b>{{ week.bestDay ? week.bestDay.label : '–' }}</b>
        <small>{{ week.bestDay ? `лучший день: ${week.bestDay.ok} верных` : 'лучшего дня пока нет' }}</small>
      </div>
    </div>

    <h2 class="today-h">Выучено за неделю <small>{{ week.learned.length }}</small></h2>
    <div v-if="week.learned.length" class="wk-learned"><span v-for="w in week.learned" :key="w.k">{{ w.k }}</span></div>
    <p v-else class="pg-empty">Слово становится выученным после трёх верных ответов подряд. Новые появятся здесь.</p>
  </div>
</template>
