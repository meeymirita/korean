<script setup lang="ts">
import { computed } from 'vue'
import PlansCalendar from '@/components/cabinet/PlansCalendar.vue'
import { weekSummary } from '@/data/review'
import { studyTime, weekArchive, type WeekReport } from '@/data/weeks'
import { useShareCard } from '@/composables/useShareCard'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const week = computed(() => weekSummary(progress.data))
const archive = computed(() => weekArchive(progress.data))
const { share, busy } = useShareCard()
const fmt = (k: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(k + 'T12:00:00'))
const range = (w: WeekReport) => `${fmt(w.start)} – ${fmt(w.end)}`
/** Картинка недели: та же карточка, что и для «Поделиться», сохраняется или уходит в меню телефона. */
function picture(w: WeekReport) {
  void share(
    {
      kicker: 'неделя',
      title: range(w),
      sub: `${w.total} ответов, верных ${w.accuracy ?? 0}%`,
      lines: [`Дней с занятиями: ${w.activeDays} из 7`, `Выучено слов: ${w.learned}`, `Время: ${studyTime(w.seconds)}`],
      icon: '📅',
      footer: '우리말',
    },
    `неделя-${w.start}`,
  )
}
const max = computed(() => Math.max(1, ...week.value.days.map(d => d.all)))
</script>

<template>
  <div class="cb-body">
    <div class="wk-row">
      <PlansCalendar class="wk-cal" />
      <section class="wk-side">
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
      </section>
    </div>

    <h2 class="today-h">Выучено за неделю <small>{{ week.learned.length }}</small></h2>
    <div v-if="week.learned.length" class="wk-learned"><span v-for="w in week.learned" :key="w.k">{{ w.k }}</span></div>
    <p v-else class="pg-empty">Слово становится выученным после трёх верных ответов подряд. Новые появятся здесь.</p>

    <h2 class="today-h">Прошлые недели <small>{{ archive.length }}</small></h2>
    <ul v-if="archive.length" class="wk-arc">
      <li v-for="w in archive" :key="w.start">
        <b>{{ range(w) }}</b>
        <span>{{ w.total }} ответов · {{ w.accuracy ?? 0 }}% верных · {{ w.activeDays }} из 7 дней<template v-if="w.learned"> · выучено {{ w.learned }}</template></span>
        <button type="button" class="plain" :disabled="busy" @click="picture(w)">Картинка</button>
      </li>
    </ul>
    <p v-else class="pg-empty">Недели с занятиями будут собираться здесь, к каждой можно сохранить картинку.</p>
  </div>
</template>

<style>
.study .wk-arc { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.study .wk-arc li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 12px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.study .wk-arc span { font-size: 14px; color: var(--muted); }
.study .wk-arc button { margin-left: auto; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
</style>
