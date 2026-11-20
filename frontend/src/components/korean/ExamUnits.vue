<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TopikQuiz from '@/components/korean/TopikQuiz.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { UNIT_PASS, UNIT_QUESTIONS, buildUnitExam, units as makeUnits, type Unit } from '@/data/korean/exam-units'
import type { Q } from '@/data/korean/topik-mock'
import { useExamStore } from '@/stores/exam'
import { useToastStore } from '@/stores/toast'

/**
 * Вкладка «Единицы»: плитка на каждую единицу книг 1A и 1B. Открытая единица запускает 20 вопросов по её пройденным темам (правила в `data/korean/exam-units.ts`).
 * Закрытые плитки в тумане: «ещё не дошли». Результат пишется на сервер (`/api/exams/units`); сдан при 80%, у сданной единицы золотое кольцо.
 */
const exams = useExamStore()
const toast = useToastStore()
const { open } = useGrammarModal()
const all = computed(() => makeUnits())
const books = computed(() => (['1A', '1B'] as const).map(b => ({ id: b, units: all.value.filter(u => u.book === b) })))
onMounted(() => void exams.loadUnits())

const current = ref<Unit | null>(null)
const qs = ref<Q[]>([])
const result = ref<{ unit: Unit; right: number; total: number; missed: Q[] } | null>(null)
const resOf = (u: Unit) => exams.units[u.id]
const passedUnit = (u: Unit) => (resOf(u)?.best ?? 0) >= UNIT_PASS * 100
function start(u: Unit) {
  qs.value = buildUnitExam(u, all.value)
  if (qs.value.length < 8) return void toast.error('По этой единице пока мало пройденного для вопросов')
  result.value = null
  current.value = u
}
async function finish(r: { correct: number; wrong: number; skipped: number; missed: Q[] }) {
  const u = current.value!
  const total = qs.value.length
  result.value = { unit: u, right: r.correct, total, missed: r.missed }
  current.value = null
  if (!(await exams.saveUnit(u.id, r.correct, total))) toast.error('Результат не сохранился на сервере')
}
const pct = (right: number, total: number) => Math.round((right / total) * 100)
const label = (g: { ko: string }) => g.ko.split(':')[0]!.trim()
</script>

<template>
  <div class="units">
    <template v-if="current">
      <TopikQuiz :questions="qs" :allow-skip="false" :label="`Единица ${current.n} · ${current.book}`" @done="finish" />
      <p class="exit"><button type="button" class="link" @click="current = null">Выйти (результат не запишется)</button></p>
    </template>
    <template v-else>
      <p class="intro">
        Короткая проверка по одной единице учебника: {{ UNIT_QUESTIONS }} вопросов только по пройденным темам. Единица открывается, когда пройдено хотя бы 3 её темы из 4. Если вопросов по своим темам мало, добавляются вопросы из соседних пройденных единиц; того, что вы ещё не проходили, в вопросах нет. Сдано при {{ Math.round(UNIT_PASS * 100) }}%.
      </p>
      <section v-if="result" class="res card" :class="pct(result.right, result.total) >= UNIT_PASS * 100 ? 'okc' : 'badc'">
        <h2>Единица {{ result.unit.n }}: {{ result.right }} из {{ result.total }} ({{ pct(result.right, result.total) }}%)</h2>
        <p>{{ pct(result.right, result.total) >= UNIT_PASS * 100 ? 'Единица сдана: на карте у неё золотое кольцо.' : 'Пока не сдано: нужно ' + Math.round(UNIT_PASS * 100) + '%. Можно пересдать сразу.' }}</p>
        <details v-if="result.missed.length">
          <summary>Ошибки ({{ result.missed.length }})</summary>
          <ul><li v-for="m in result.missed" :key="m.id">{{ m.prompt }} → <b class="ko">{{ m.answer }}</b></li></ul>
        </details>
      </section>
      <section v-for="b in books" :key="b.id" class="book">
        <h2>Книга {{ b.id }}</h2>
        <div class="grid">
          <article v-for="u in b.units" :key="u.id" class="tile" :class="{ closed: !u.open, gold: passedUnit(u) }">
            <header>
              <b>Единица {{ u.n }}</b>
              <span class="cnt">{{ u.passed.length }} из {{ u.cards.length }}</span>
            </header>
            <ul class="topics">
              <li v-for="g in u.cards" :key="g.id" :class="{ ok: g.st === 'ok' }">
                <button type="button" class="t" @click="open(g.id, true)">{{ label(g) }}</button>
              </li>
            </ul>
            <div class="foot">
              <template v-if="u.open">
                <span v-if="resOf(u)" class="best">лучший {{ resOf(u)!.best }}% · попыток {{ resOf(u)!.tries }}</span>
                <button type="button" class="go" @click="start(u)">{{ resOf(u) ? 'Пересдать' : 'Начать' }}</button>
              </template>
              <span v-else class="fog">ещё не дошли</span>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.intro { margin: 8px 0 14px; max-width: 760px; color: var(--muted); font-size: 14px; line-height: 1.55; }
.card { margin: 0 0 18px; padding: 16px 20px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); }
.card h2 { margin: 0 0 6px; font-size: 18px; }
.res.okc { border-color: var(--gold, #f3b93d); }
.res.badc { border-color: rgba(214, 77, 100, .5); }
.res ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
.book h2 { margin: 18px 0 10px; font-size: 18px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.tile { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); transition: transform .15s, box-shadow .15s; }
.tile:not(.closed):hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(100, 87, 170, .16); }
.tile.gold { border-color: var(--gold, #f3b93d); box-shadow: 0 0 0 3px rgba(243, 185, 61, .28); }
.tile.closed { opacity: .6; filter: saturate(.5); background-image: linear-gradient(135deg, transparent 40%, rgba(150, 140, 210, .18)); }
.tile header { display: flex; justify-content: space-between; align-items: baseline; }
.cnt { padding: 1px 10px; border-radius: 99px; background: rgba(214, 77, 169, .12); color: var(--pink, #d64da9); font-size: 12px; font-weight: 700; }
.topics { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.topics li .t { padding: 3px 10px; border: 1px solid var(--line); border-radius: 99px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; cursor: pointer; }
.topics li.ok .t { border-color: var(--petal-line, #e0559f); color: inherit; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; min-height: 34px; }
.best { color: var(--muted); font-size: 12px; }
.fog { color: var(--muted); font-size: 13px; font-style: italic; }
.go { padding: 7px 18px; border: 0; border-radius: 99px; background: var(--accent); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.exit { text-align: center; margin-top: 14px; }
.link { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; }
</style>
