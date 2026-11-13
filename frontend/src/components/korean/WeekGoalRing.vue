<script setup lang="ts">
import { computed } from 'vue'
import { weekGoal } from '@/data/weekgoal'
import { useProgressStore } from '@/stores/progress'

/** Кольцо недельной цели (пн–вс): «Неделя: 3 из 5 дней, 64 из 100 верных». Гость видит свои локальные данные, ничего не сохраняется. */
const progress = useProgressStore()
const w = computed(() => weekGoal(progress.data))
const R = 34
const C = 2 * Math.PI * R
const pct = (n: number, m: number) => Math.min(100, Math.round((n / m) * 100))
</script>

<template>
  <section class="wg" :class="{ done: w.done }" aria-label="Недельная цель">
    <svg class="wg-ring" viewBox="0 0 80 80" role="img" :aria-label="`Неделя выполнена на ${Math.round(w.ratio * 100)}%`">
      <circle class="wg-track" cx="40" cy="40" :r="R" />
      <circle class="wg-arc" cx="40" cy="40" :r="R" :stroke-dasharray="C" :stroke-dashoffset="C * (1 - w.ratio)" transform="rotate(-90 40 40)" />
      <text x="40" y="45" text-anchor="middle" class="wg-pct">{{ Math.round(w.ratio * 100) }}%</text>
    </svg>
    <div class="wg-body">
      <h2 class="wg-h">Неделя: {{ w.days }} из {{ w.goalDays }} дней, {{ w.ok }} из {{ w.goalOk }} верных</h2>
      <div class="pg-bar"><i :style="{ width: pct(w.days, w.goalDays) + '%' }"></i></div>
      <div class="pg-bar"><i :style="{ width: pct(w.ok, w.goalOk) + '%' }"></i></div>
      <p class="wg-s">{{ w.done ? 'Цель недели выполнена.' : 'Неделя с понедельника; цель меняется в кабинете, «Настройки».' }}</p>
    </div>
  </section>
</template>

<style>
.study .wg { display: flex; align-items: center; gap: 18px; max-width: 520px; margin: 0 0 18px; padding: 14px 18px; background: rgba(255, 255, 255, .7); border: 1px solid #fff; border-radius: 22px; }
.study .wg-ring { flex: none; width: 84px; height: 84px; }
.study .wg-track { fill: none; stroke: rgba(150, 130, 230, .18); stroke-width: 8; }
.study .wg-arc { fill: none; stroke: #b79cf0; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset .5s; }
.study .wg.done .wg-arc { stroke: var(--ok); }
.study .wg-pct { fill: var(--ink); font-size: 16px; font-weight: 700; }
.study .wg-body { flex: 1; min-width: 0; }
.study .wg-h { margin: 0; padding: 0; border: 0; font-size: 16px; font-weight: 700; line-height: 1.3; }
.study .wg-s { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .study .wg-arc { transition: none; } }
</style>
