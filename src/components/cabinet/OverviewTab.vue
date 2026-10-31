<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import LineChart from '@/components/charts/LineChart.vue'
import HeatMap from '@/components/cabinet/HeatMap.vue'
import { moodSummary, MOODS } from '@/data/mood'
import { personalRecords } from '@/data/records'
import { answersByDay } from '@/data/charts'
import { ACHIEVEMENTS } from '@/data/achievements'
import { useShareCard } from '@/composables/useShareCard'
import { MAX_LEVEL } from '@/data/levels'
import { CATN, D } from '@/data/korean/words'
import { KNOWN_STREAK, dayKey, useProgressStore } from '@/stores/progress'
import { formatSpent, useTimerStore } from '@/stores/timer'

const progress = useProgressStore()
const timer = useTimerStore()
const info = computed(() => progress.info)
/** Время занятий по таймеру: сегодня, за 7 дней и за всё время. */
const spent = computed(() => {
  const t = progress.data.time
  let week = 0
  const d = new Date()
  for (let i = 0; i < 7; i++, d.setDate(d.getDate() - 1)) week += t[dayKey(d)] ?? 0
  const total = Object.values(t).reduce((n, x) => n + x, 0) + (timer.today - (t[dayKey()] ?? 0))
  return { today: timer.today, week: week + (timer.today - (t[dayKey()] ?? 0)), total }
})
const words = computed(() => progress.data.words)

/* графики: ответы за 30 дней, минуты за 14, радар по темам, прогноз повторений */
const ans = computed(() => answersByDay(progress.data, 30))
const answerSeries = computed(() => [
  { name: 'Всего ответов', values: ans.value.map(a => a.all), color: '#1f93cf' },
  { name: 'Верных', values: ans.value.map(a => a.ok), color: '#7a63e8' },
])
const goal = computed(() => progress.goal)
const mood = computed(() => moodSummary(progress.data.moods))
const moodColor = (s: number | null) => (s === null ? '' : s < 1.67 ? 'm1' : s < 2.34 ? 'm2' : 'm3')
const records = computed(() => personalRecords(progress.data))
const hasRecords = computed(() => !!records.value.bestDay || !!records.value.bestTime)
const dayLabel = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const weekLabel = (k: string) => {
  const a = new Date(k + 'T12:00:00')
  const b = new Date(a)
  b.setDate(a.getDate() + 6)
  return `${a.getDate()}–${b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
}

const knownCount = computed(() => D.filter(d => progress.status(d.k) === 'known').length)
const learningCount = computed(() => D.filter(d => progress.status(d.k) === 'learning').length)

const byCategory = computed(() =>
  Object.entries(CATN).map(([id, name]) => {
    const list = D.filter(d => d.c.includes(id))
    return {
      id,
      name,
      total: list.length,
      known: list.filter(d => progress.status(d.k) === 'known').length,
      learning: list.filter(d => progress.status(d.k) === 'learning').length,
    }
  }),
)

const weak = computed(() =>
  D.filter(d => {
    const w = words.value[d.k]
    return w && w.streak < KNOWN_STREAK && w.bad > 0
  })
    .map(d => ({ d, w: words.value[d.k]! }))
    .sort((a, b) => b.w.bad - b.w.ok - (a.w.bad - a.w.ok) || b.w.bad - a.w.bad)
    .slice(0, 12),
)


const achievements = computed(() =>
  ACHIEVEMENTS.map(a => {
    const [cur, g] = a.progress(progress.data, progress.streak)
    return { ...a, cur: Math.min(cur, g), goal: g, done: cur >= g }
  }),
)
const doneCount = computed(() => achievements.value.filter(a => a.done).length)

const SOURCES: [string, string][] = [
  ['game', 'Игра «Хлебушек»'],
  ['trainer', 'Тренажёры'],
  ['today', 'Сегодня'],
  ['review', 'Повторение в кабинете'],
  ['quick', '5 минут'],
]
const total = computed(() =>
  Object.values(progress.data.sources).reduce((n, x) => ({ ok: n.ok + x.ok, bad: n.bad + x.bad }), { ok: 0, bad: 0 }),
)

const { share, busy: sharing } = useShareCard()
const shareAch = (a: (typeof achievements.value)[number]) =>
  share({ kicker: 'достижение', title: a.title, sub: a.desc, lines: [`Уровень ${progress.info.level} · ${progress.info.title}`, `Серия: ${progress.streak}`], icon: a.icon }, `достижение-${a.id}`)
</script>

<template>
  <div class="cb-body">
    <div class="pg-cards">
      <div class="pg-card">
        <div class="pg-k">Уровень</div>
        <div class="pg-v">{{ info.level }} <small>из {{ MAX_LEVEL }}</small></div>
        <div class="pg-t">{{ info.title }}</div>
        <div class="pg-bar"><i :style="{ width: info.pct + '%' }"></i></div>
        <div class="pg-s">{{ info.max ? 'максимальный уровень' : `${info.into} / ${info.span} очков до следующего` }} · всего {{ info.xp }}</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Серия дней</div>
        <div class="pg-v">🔥 {{ progress.streak }}</div>
        <div class="pg-t">лучшая серия: {{ progress.bestStreak }}</div>
        <div class="pg-s">заниматься нужно хотя бы раз в день</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Время занятий</div>
        <div class="pg-v">⏱ {{ formatSpent(spent.today) }}</div>
        <div class="pg-t">за 7 дней: {{ formatSpent(spent.week) }}</div>
        <div class="pg-s">всего {{ formatSpent(spent.total) }} · таймер справа внизу, включай его, когда занимаешься</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Цель дня</div>
        <div class="pg-v">🎯 {{ Math.min(progress.todayOk, goal) }} <small>из {{ goal }}</small></div>
        <div class="pg-bar goal"><i :style="{ width: Math.min(100, (progress.todayOk / goal) * 100) + '%' }"></i></div>
        <div class="pg-s">{{ progress.goalDone ? 'выполнена 🎉' : `ещё ${goal - progress.todayOk} верных ответов` }}</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Выученные слова</div>
        <div class="pg-v">🌸 {{ knownCount }} <small>из {{ D.length }}</small></div>
        <div class="pg-bar"><i :style="{ width: (knownCount / D.length) * 100 + '%' }"></i></div>
        <div class="pg-s">{{ learningCount }} в процессе · слово выучено, когда набрал {{ KNOWN_STREAK }} очков: верный ответ +1, ошибка −1</div>
      </div>
    </div>

    <template v-if="hasRecords">
      <h2 class="today-h">Личные рекорды <small v-if="records.todayIsBest">сегодня лучший день! 🎉</small></h2>
      <div class="pg-rec">
        <div v-if="records.bestDay" class="pg-recc"><span class="k">Лучший день</span><b>{{ records.bestDay.n }}</b><small>верных · {{ dayLabel(records.bestDay.key) }}</small></div>
        <div v-if="records.bestWeek" class="pg-recc"><span class="k">Лучшая неделя</span><b>{{ records.bestWeek.n }}</b><small>верных · {{ weekLabel(records.bestWeek.key) }}</small></div>
        <div v-if="records.longestStreak" class="pg-recc"><span class="k">Самая длинная серия</span><b>{{ records.longestStreak }}</b><small>{{ records.longestStreak === 1 ? 'день' : 'дн.' }} подряд</small></div>
        <div v-if="records.bestTime" class="pg-recc"><span class="k">Дольше всего занимался</span><b>{{ formatSpent(records.bestTime.n) }}</b><small>{{ dayLabel(records.bestTime.key) }}</small></div>
      </div>
    </template>

    <template v-if="mood.total">
      <h2 class="today-h">Настроение занятий <small>{{ mood.total }} отметок</small></h2>
      <div class="md-box">
        <div class="md-days" aria-label="Последние 14 дней">
          <span v-for="d in mood.recent" :key="d.key" class="md-d" :class="moodColor(d.score)" :title="d.score === null ? `${d.key}: без отметок` : `${d.key}: ${d.score < 1.67 ? 'легко' : d.score < 2.34 ? 'нормально' : 'тяжело'}`"></span>
        </div>
        <p class="md-sum">
          <span v-for="(m, i) in MOODS" :key="m.id">{{ m.icon }} {{ m.label.toLowerCase() }}: <b>{{ mood.counts[i] }}</b></span>
        </p>
        <p v-if="mood.hardest" class="md-hard">Тяжелее всего обычно {{ mood.hardest }}: можно взять задания полегче или короче.</p>
      </div>
    </template>

    <h2 class="today-h">Дни занятий <small>последние полгода</small></h2>
    <div class="pg-days">
      <HeatMap />
      <LineChart class="pg-days-ch" title="Ответы за 30 дней" :labels="ans.map(a => a.label)" :series="answerSeries" unit="отв." />
    </div>

    <h2 class="today-h">Слова по темам</h2>
    <div class="pg-cats">
      <div v-for="c in byCategory" :key="c.id" class="pg-cat">
        <div class="pg-cn">{{ c.name }}</div>
        <div class="pg-stack">
          <i class="known" :style="{ width: (c.known / c.total) * 100 + '%' }"></i>
          <i class="learning" :style="{ width: (c.learning / c.total) * 100 + '%' }"></i>
        </div>
        <div class="pg-cnum">{{ c.known }} / {{ c.total }}</div>
      </div>
    </div>
    <p class="pg-legend"><i class="known"></i> выучено <i class="learning"></i> в процессе</p>

    <h2 class="today-h">Над чем стоит поработать <RouterLink v-if="weak.length" to="/korean/mistakes" class="mk-link">все ошибки →</RouterLink></h2>
    <div v-if="weak.length" class="pg-weak">
      <div v-for="x in weak" :key="x.d.n" class="pg-w">
        <b class="ko">{{ x.d.k }}</b>
        <span>{{ x.d.t }}</span>
        <small>верно {{ x.w.ok }} · неверно {{ x.w.bad }}</small>
      </div>
    </div>
    <p v-else class="pg-empty">Слабых слов пока нет: ошибёшься в слове, и оно появится здесь.</p>

    <h2 class="today-h">Достижения <small>{{ doneCount }} из {{ achievements.length }}</small></h2>
    <div class="pg-ach">
      <div v-for="a in achievements" :key="a.id" class="pg-a" :class="{ done: a.done }">
        <span class="pg-ai">{{ a.icon }}</span>
        <div>
          <b>{{ a.title }}</b>
          <small>{{ a.desc }}</small>
          <div class="pg-bar"><i :style="{ width: (a.cur / a.goal) * 100 + '%' }"></i></div>
        </div>
        <span class="pg-an">{{ a.cur }} / {{ a.goal }}</span>
        <button v-if="a.done" class="pg-share" title="Поделиться достижением" aria-label="Поделиться достижением" :disabled="sharing" @click="shareAch(a)">🖼</button>
      </div>
    </div>

    <h2 class="today-h">Ответы <small>всего верно {{ total.ok }}, неверно {{ total.bad }}</small></h2>
    <table class="pg-tbl">
      <tr v-for="[id, name] in SOURCES" :key="id">
        <td>{{ name }}</td>
        <td>верно {{ progress.data.sources[id]?.ok ?? 0 }}</td>
        <td>неверно {{ progress.data.sources[id]?.bad ?? 0 }}</td>
      </tr>
    </table>
  </div>
</template>
