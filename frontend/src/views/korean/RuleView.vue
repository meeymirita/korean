<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import TaskSession from '@/components/korean/TaskSession.vue'
import { G, tabOf } from '@/data/korean/grammar'
import { ruleSession, trainableRule } from '@/data/korean/rule-tasks'

/** «Потренировать правило»: серия заданий из примеров выбранной карточки грамматики (`/game/home?game=rule&g=<id>`). */
const route = useRoute()
const router = useRouter()
const GROUPS = [
  { tab: 0, title: 'Мои карточки' },
  { tab: 1, title: 'Часть 1' },
  { tab: 2, title: 'Часть 2' },
] as const
const cards = G.filter(trainableRule)
const gid = computed(() => String(route.query.g ?? ''))
const card = computed(() => cards.find(g => g.id === gid.value))
const tasks = ref(card.value ? ruleSession(card.value) : [])
const round = ref(0)
const again = () => {
  if (card.value) tasks.value = ruleSession(card.value)
  round.value++
}
watch(card, again)
const pick = (e: Event) => void router.replace({ query: { ...route.query, g: (e.target as HTMLSelectElement).value || undefined } })
</script>

<template>
  <div class="wrap rl">
    <div class="rl-pick">
      <label for="rl-sel">Правило</label>
      <select id="rl-sel" :value="gid" @change="pick">
        <option value="">Выбери карточку грамматики…</option>
        <optgroup v-for="grp in GROUPS" :key="grp.tab" :label="grp.title">
          <option v-for="g in cards.filter(x => tabOf(x) === grp.tab)" :key="g.id" :value="g.id">{{ g.ko.replace(/\{[a-z]\|([^}]*)\}/g, '$1') }} — {{ g.ru }}</option>
        </optgroup>
      </select>
      <RouterLink v-if="card" :to="{ path: '/korean/grammar', query: { g: card.id } }" class="qk-home">Открыть карточку</RouterLink>
    </div>
    <p v-if="!card" class="rl-hint">Выбери правило из списка: задания строятся из примеров его карточки. Или открой карточку на странице грамматики и нажми «Потренировать это правило».</p>
    <TaskSession v-else :key="card.id + ':' + round" :tasks="tasks" source="trainer" mode="rule" again-label="Ещё серия" @again="again" />
  </div>
</template>

<style scoped>
.rl-pick { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 4px 0 14px; }
.rl-pick label { font-weight: 600; }
.rl-pick select { min-width: 260px; max-width: 100%; padding: 9px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: inherit; font: inherit; }
.rl-hint { color: var(--muted); max-width: 560px; }
</style>
