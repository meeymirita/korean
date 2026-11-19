<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { weakLink, weakSpot } from '@/data/charts'
import { useProgressStore } from '@/stores/progress'

/** «Слабое место дня» в «Сегодня»: самое проваленное правило за неделю (или за месяц) и кнопка потренировать. Нет слабых правил: карточки нет. */
const progress = useProgressStore()
const spot = computed(() => (progress.unlocked && !progress.isGuest ? weakSpot(progress.data.log) : null))
const period = computed(() => (spot.value?.days === 7 ? 'за неделю' : 'за месяц'))
</script>

<template>
  <section v-if="spot" class="ws" aria-label="Слабое место дня">
    <div class="ws-text">
      <small>Слабое место дня</small>
      <b>{{ spot.rule.label }}</b>
      <span>Верно {{ spot.rule.accuracy }}% ({{ spot.rule.bad }} ошибок из {{ spot.rule.ok + spot.rule.bad }} {{ period }}). Потренируй это сегодня.</span>
    </div>
    <RouterLink :to="weakLink(spot.rule)" class="ws-go">Потренировать</RouterLink>
  </section>
</template>

<style scoped>
.ws { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 0 0 16px; padding: 14px 18px; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 16px; background: var(--surface); }
.ws-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ws-text small { color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.ws-text b { font-size: 17px; overflow-wrap: anywhere; }
.ws-text span { color: var(--muted); font-size: 14px; }
.ws-go { flex: none; padding: 9px 20px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
.ws-go:hover { filter: brightness(1.08); }
</style>
