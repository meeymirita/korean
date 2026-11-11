<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import TaskSession from '@/components/korean/TaskSession.vue'
import { G, tabOf } from '@/data/korean/grammar'
import { weakRules } from '@/data/charts'
import { EXAM_ID, examWeakCards } from '@/data/korean/exam'
import { useExamStore } from '@/stores/exam'
import { mixedSession, ruleSession, trainableRule } from '@/data/korean/rule-tasks'
import { useProgressStore } from '@/stores/progress'

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
/**
 * «Слабые места» (`&weak=1`, ссылки в «Обзоре» кабинета и на странице экзамена): серия из двух правил.
 * Первыми идут правила, по которым на последнем экзамене меньше 70%, потом правила с самой низкой точностью за 30 дней.
 */
const progress = useProgressStore()
const exams = useExamStore()
const weakOn = computed(() => route.query.weak === '1')
const weakCards = computed(() => {
  const fromLog = weakRules(progress.data.log, 30).filter(r => r.id.startsWith('rule:')).map(r => r.id.slice(5))
  return [...new Set([...examWeakCards(exams.results[EXAM_ID]?.rules), ...fromLog])]
    .map(id => cards.find(c => c.id === id))
    .filter(c => !!c)
    .slice(0, 2)
})
/** Правила текущей серии: запоминаются при сборке, чтобы ответы самой серии не меняли её на ходу. */
const weakNow = ref(weakCards.value)
const build = () => {
  if (!weakOn.value) return card.value ? ruleSession(card.value) : []
  weakNow.value = weakCards.value
  return mixedSession(weakNow.value)
}
const tasks = ref(build())
const round = ref(0)
const again = () => {
  tasks.value = build()
  round.value++
}
watch([card, weakOn], again)
// журнал ответов подставляется после оживления страницы: собрать серию, когда он появился
watch(() => weakCards.value.length, n => void (weakOn.value && !tasks.value.length && n && again()))
// результат экзамена лежит на сервере: дочитать и пересобрать серию с его слабыми правилами
onMounted(async () => {
  if (!weakOn.value || exams.loaded) return
  await exams.load()
  if (weakOn.value && examWeakCards(exams.results[EXAM_ID]?.rules).length) again()
})
const pick = (e: Event) => void router.replace({ query: { ...route.query, weak: undefined, g: (e.target as HTMLSelectElement).value || undefined } })
const label = (ko: string) => ko.replace(/\{[a-z]\|([^}]*)\}/g, '$1')
</script>

<template>
  <div class="wrap rl">
    <div class="rl-pick">
      <label for="rl-sel">Правило</label>
      <select id="rl-sel" :value="weakOn ? '' : gid" @change="pick">
        <option value="">Выбери карточку грамматики…</option>
        <optgroup v-for="grp in GROUPS" :key="grp.tab" :label="grp.title">
          <option v-for="g in cards.filter(x => tabOf(x) === grp.tab)" :key="g.id" :value="g.id">{{ label(g.ko) }} — {{ g.ru }}</option>
        </optgroup>
      </select>
      <RouterLink v-if="card && !weakOn" :to="{ path: '/korean/grammar', query: { g: card.id } }" class="qk-home">Открыть карточку</RouterLink>
    </div>
    <template v-if="weakOn">
      <p v-if="weakNow.length" class="rl-hint">Слабые места: {{ weakNow.map(c => `${label(c.ko)} (${c.ru})`).join(' и ') }}. Это правила, по которым на экзамене меньше 70%, и правила с самой низкой точностью за 30 дней.</p>
      <p v-else class="rl-hint">Слабых мест пока не видно: нужно хотя бы три ответа по правилу за последние 30 дней или результат экзамена. Выбери правило из списка.</p>
      <TaskSession v-if="tasks.length" :key="'weak:' + round" :tasks="tasks" source="trainer" mode="rule" again-label="Ещё серия" @again="again" />
    </template>
    <p v-else-if="!card" class="rl-hint">Выбери правило из списка: задания строятся из примеров его карточки. Или открой карточку на странице грамматики и нажми «Потренировать это правило».</p>
    <TaskSession v-else :key="card.id + ':' + round" :tasks="tasks" source="trainer" mode="rule" again-label="Ещё серия" @again="again" />
  </div>
</template>

<style scoped>
.rl-pick { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 4px 0 14px; }
.rl-pick label { font-weight: 600; }
.rl-pick select { min-width: 260px; max-width: 100%; padding: 9px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: inherit; font: inherit; }
.rl-hint { color: var(--muted); max-width: 560px; }
</style>
