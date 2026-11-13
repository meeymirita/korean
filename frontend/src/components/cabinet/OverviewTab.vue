<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, onMounted, ref, watch } from 'vue'
import LevelsModal from '@/components/cabinet/LevelsModal.vue'
import { RouterLink } from 'vue-router'
import LineChart from '@/components/charts/LineChart.vue'
import HeatMap from '@/components/cabinet/HeatMap.vue'
import { moodSummary, MOODS } from '@/data/mood'
import { personalRecords } from '@/data/records'
import { answersByDay, weakRules } from '@/data/charts'
import { ACHIEVEMENTS } from '@/data/achievements'
import { achievedAt, markAchieved } from '@/lib/achievedDates'
import { useShareCard } from '@/composables/useShareCard'
import { MAX_LEVEL } from '@/data/levels'
import RankPic from '@/components/RankPic.vue'
import { CATN, D } from '@/data/korean/words'
import TaskSession from '@/components/korean/TaskSession.vue'
import { STALE_DAYS, STALE_DRILL, STALE_PAGE, WEAK_LIMIT, staleTasks, staleWords, topicOrAll, weakWords } from '@/data/korean/stale'
import { usePersisted } from '@/composables/usePersisted'
import type { Task } from '@/data/korean/tasks'
import { KNOWN_STREAK, dayKey, useProgressStore } from '@/stores/progress'
import { formatSpent, useTimerStore } from '@/stores/timer'

const progress = useProgressStore()
const timer = useTimerStore()
const info = computed(() => progress.info)
const levelsOpen = ref(false)
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
const weakRuleRows = computed(() => weakRules(progress.data.log, 30))
const ruleLink = (family?: string) => ({ path: '/game/home', query: { game: 'ptext', ...(family ? { fam: family } : {}) } })
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

/** Фильтр слабых слов по теме словаря (пусто: все темы), помнится до закрытия вкладки. */
const weakTopic = usePersisted('ov_weak_topic', '', v => topicOrAll(v) === v)
const weak = computed(() => weakWords(progress.data, topicOrAll(weakTopic.value), WEAK_LIMIT))

/** «Давно не видел»: «сейчас» берётся только на клиенте, на сервере список пуст (нет расхождения при отрисовке). */
const now = ref(0)
onMounted(() => (now.value = Date.now()))
const stale = computed(() => (now.value ? staleWords(progress.data, now.value) : []))
const staleShown = ref(STALE_PAGE)
const staleDrillTasks = ref<Task[]>([])
const staleDrilling = ref(false)
const staleAgo = (days: number) => (days >= 60 ? `${Math.floor(days / 30)} мес. назад` : `${days} дн. назад`)
function startStale() {
  staleDrillTasks.value = staleTasks(progress.data, now.value, STALE_DRILL)
  staleDrilling.value = staleDrillTasks.value.length > 0
}

/** Бьётся после каждой новой отметки даты, чтобы achievements пересчитался и подхватил её из localStorage. */
const dateTick = ref(0)
const achievements = computed(() => {
  void dateTick.value
  return ACHIEVEMENTS.map(a => {
    const [cur, g] = a.progress(progress.data, progress.studyDays)
    const done = cur >= g
    return { ...a, cur: Math.min(cur, g), goal: g, done, date: done ? achievedAt(a.id) : null }
  })
})
const doneCount = computed(() => achievements.value.filter(a => a.done).length)
/** Первый раз, когда бейдж увидели выполненным на этом устройстве, — запоминаем дату (lib/achievedDates.ts, не на сервере). */
watch(achievements, list => {
  if (list.some(a => a.done && a.date === null)) {
    for (const a of list) if (a.done && a.date === null) markAchieved(a.id)
    dateTick.value++
  }
})
const achDate = (t: number) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(t)

const SOURCES: [string, string][] = [
  ['game', 'Игра «Хлебушек»'],
  ['trainer', 'Тренажёры'],
  ['today', 'Сегодня'],
  ['review', 'Повторение'],
  ['quick', '5 минут'],
]
const total = computed(() =>
  Object.values(progress.data.sources).reduce((n, x) => ({ ok: n.ok + x.ok, bad: n.bad + x.bad }), { ok: 0, bad: 0 }),
)

const { share, busy: sharing } = useShareCard()
const shareAch = (a: (typeof achievements.value)[number]) =>
  share({ kicker: 'достижение', title: a.title, sub: a.desc, lines: [`Уровень ${progress.info.level} · ${progress.info.title}`, `Дней занятий: ${progress.studyDays}`], icon: 'trophy' }, `достижение-${a.id}`)
</script>

<template>
  <div class="cb-body">
    <div class="pg-cards">
      <div class="pg-card">
        <div class="pg-k">Уровень</div>
        <div class="pg-v"><span v-count="info.level">{{ info.level }}</span> <small>из {{ MAX_LEVEL }}</small></div>
        <div class="pg-t pg-rank"><RankPic :level="info.level" />{{ info.title }}</div>
        <div class="pg-bar"><i :style="{ width: info.pct + '%' }"></i></div>
        <div class="pg-s">{{ info.max ? 'максимальный уровень' : `${info.into} / ${info.span} очков до следующего` }} · всего {{ info.xp }}</div>
        <button type="button" class="pg-lvl-btn" @click="levelsOpen = true">Все уровни</button>
      </div>
      <div class="pg-card">
        <div class="pg-k">Дней занятий</div>
        <div class="pg-v"><Icon name="fire" /> <span v-count="progress.studyDays">{{ progress.studyDays }}</span></div>
        <div class="pg-s">считаются дни, в которые были ответы; пропуск ничего не сбрасывает</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Время занятий</div>
        <div class="pg-v"><Icon name="stopwatch" /> {{ formatSpent(spent.today) }}</div>
        <div class="pg-t">за 7 дней: {{ formatSpent(spent.week) }}</div>
        <div class="pg-s">всего {{ formatSpent(spent.total) }} · таймер справа внизу, включай его, когда занимаешься</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Цель дня</div>
        <div class="pg-v"><Icon name="target" /> <span v-count="Math.min(progress.todayOk, goal)">{{ Math.min(progress.todayOk, goal) }}</span> <small>из {{ goal }}</small></div>
        <div class="pg-bar goal"><i :style="{ width: Math.min(100, (progress.todayOk / goal) * 100) + '%' }"></i></div>
        <div class="pg-s"><template v-if="progress.goalDone">выполнена <Icon name="party" /></template><template v-else>ещё {{ goal - progress.todayOk }} верных ответов</template></div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Выученные слова</div>
        <div class="pg-v"><Icon name="sakura" /> <span v-count="knownCount">{{ knownCount }}</span> <small>из {{ D.length }}</small></div>
        <div class="pg-bar"><i :style="{ width: (knownCount / D.length) * 100 + '%' }"></i></div>
        <div class="pg-s">{{ learningCount }} в процессе · слово выучено, когда набрал {{ KNOWN_STREAK }} очков: верный ответ +1, ошибка −1</div>
      </div>
    </div>

    <template v-if="hasRecords">
      <h2 class="today-h">Личные рекорды <small v-if="records.todayIsBest">сегодня лучший день! <Icon name="party" /></small></h2>
      <div class="pg-rec">
        <div v-if="records.bestDay" class="pg-recc"><span class="k">Лучший день</span><b v-count="records.bestDay.n">{{ records.bestDay.n }}</b><small>верных · {{ dayLabel(records.bestDay.key) }}</small></div>
        <div v-if="records.bestWeek" class="pg-recc"><span class="k">Лучшая неделя</span><b v-count="records.bestWeek.n">{{ records.bestWeek.n }}</b><small>верных · {{ weekLabel(records.bestWeek.key) }}</small></div>
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
          <span v-for="(m, i) in MOODS" :key="m.id"><Icon :name="m.icon" /> {{ m.label.toLowerCase() }}: <b>{{ mood.counts[i] }}</b></span>
        </p>
        <p v-if="mood.hardest" class="md-hard">Тяжелее всего обычно {{ mood.hardest }}: можно взять задания полегче или короче.</p>
      </div>
    </template>

    <h2 class="today-h">Дни занятий <small>последние полгода</small></h2>
    <div class="pg-days">
      <HeatMap />
      <LineChart class="pg-days-ch" title="Ответы за 30 дней" :labels="ans.map(a => a.label)" :series="answerSeries" unit="отв." />
    </div>

    <template v-if="weakRuleRows.length">
      <h2 class="today-h">Слабые правила <small>точность за 30 дней</small> <RouterLink v-if="weakRuleRows.some(r => r.id.startsWith('rule:'))" :to="{ path: '/game/home', query: { game: 'rule', weak: '1' } }" class="mk-link">потренировать слабые места →</RouterLink></h2>
      <div class="pg-weak-rules">
        <div v-for="rule in weakRuleRows" :key="rule.id" class="pg-weak-rule">
          <div class="pg-weak-rule-head"><span>{{ rule.label }}</span><b>{{ rule.accuracy }}%</b></div>
          <div class="pg-weak-rule-track" role="img" :aria-label="`${rule.label}: верно ${rule.accuracy}% из ${rule.ok + rule.bad} ответов`"><i :style="{ width: `${rule.accuracy}%` }"></i></div>
          <div class="pg-weak-rule-foot"><small>{{ rule.ok }} верно · {{ rule.bad }} ошибок</small><RouterLink :to="ruleLink(rule.family)">Тексты по правилу →</RouterLink></div>
        </div>
      </div>
    </template>

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
    <label class="pg-filter">Тема
      <select v-model="weakTopic" aria-label="Тема слабых слов">
        <option value="">Все</option>
        <option v-for="(name, id) in CATN" :key="id" :value="id">{{ name }}</option>
      </select>
    </label>
    <div v-if="weak.length" class="pg-weak">
      <div v-for="x in weak" :key="x.d.n" class="pg-w">
        <b class="ko">{{ x.d.k }}</b>
        <span>{{ x.d.t }}</span>
        <small>верно {{ x.w.ok }} · неверно {{ x.w.bad }}</small>
      </div>
    </div>
    <p v-else-if="weakTopic" class="pg-empty">В этой теме слабых слов нет.</p>
    <p v-else class="pg-empty">Слабых слов пока нет: ошибёшься в слове, и оно появится здесь.</p>

    <section v-if="stale.length || staleDrilling" class="pg-stale" aria-label="Давно не видел">
      <h2 class="today-h">Давно не видел <small>последний ответ старше {{ STALE_DAYS }} дней, слов: {{ stale.length }}</small></h2>
      <template v-if="staleDrilling">
        <button type="button" class="chip" @click="staleDrilling = false">← К списку</button>
        <TaskSession :tasks="staleDrillTasks" source="trainer" mode="stale" again-label="Ещё серию" @again="startStale" />
      </template>
      <template v-else>
        <p class="pg-note">Обзор того, что забылось. Расписание повторений живёт на вкладке «Повторить».</p>
        <div class="pg-stale-list">
          <div v-for="x in stale.slice(0, staleShown)" :key="x.d.k" class="pg-stale-row">
            <b class="ko">{{ x.d.k }}</b>
            <span>{{ x.d.t }}</span>
            <small>{{ staleAgo(x.days) }} · {{ x.w.streak >= KNOWN_STREAK ? 'выучено' : 'не выучено' }}, очки {{ x.w.streak }}</small>
          </div>
        </div>
        <div class="pg-stale-act">
          <button v-if="stale.length > staleShown" type="button" class="chip" @click="staleShown += STALE_PAGE">Показать ещё {{ Math.min(STALE_PAGE, stale.length - staleShown) }}</button>
          <button type="button" class="chip on pg-stale-go" :title="`Серия до ${STALE_DRILL} заданий по этим словам`" @click="startStale">Повторить их</button>
        </div>
      </template>
    </section>

    <h2 class="today-h">Достижения <small>{{ doneCount }} из {{ achievements.length }}</small></h2>
    <div class="pg-ach">
      <div v-for="a in achievements" :key="a.id" class="pg-a" :class="{ done: a.done }">
        <span class="pg-ai"><Icon :name="a.icon" /></span>
        <div>
          <b>{{ a.title }}</b>
          <small>{{ a.date ? `Получено ${achDate(a.date)}` : a.desc }}</small>
          <div class="pg-bar"><i :style="{ width: (a.cur / a.goal) * 100 + '%' }"></i></div>
        </div>
        <span class="pg-an">{{ a.cur }} / {{ a.goal }}</span>
        <button v-if="a.done" class="pg-share" title="Поделиться достижением" aria-label="Поделиться достижением" :disabled="sharing" @click="shareAch(a)"><Icon name="picture" /></button>
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
    <LevelsModal v-if="levelsOpen" :info="info" @close="levelsOpen = false" />
</div>
</template>

<style>
.study .pg-lvl-btn { margin-top: 8px; padding: 2px 12px; border: 1px solid rgba(214, 77, 169, .3); border-radius: 999px; background: rgba(214, 77, 169, .06); font-size: 12px; font-weight: 400; color: var(--pink, #d64da9); }
.study .pg-lvl-btn:hover { background: rgba(214, 77, 169, .14); border-color: rgba(214, 77, 169, .55); }
.pg-weak-rules { display: grid; gap: 12px; max-width: 740px; }
.pg-weak-rule { padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
.pg-weak-rule-head, .pg-weak-rule-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.pg-weak-rule-head b { color: var(--pink, #d64da9); font-size: 17px; }
.pg-weak-rule-track { height: 7px; margin: 8px 0; overflow: hidden; border-radius: 8px; background: var(--line); }
.pg-weak-rule-track i { display: block; height: 100%; border-radius: inherit; background: var(--pink, #d64da9); }
.pg-weak-rule-foot small { color: var(--muted); }
.pg-filter { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--muted); }
.pg-filter select { padding: 5px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: inherit; font: inherit; }
.pg-stale-list { display: grid; gap: 6px; margin-top: 12px; max-width: 740px; }
.pg-stale-row { display: grid; grid-template-columns: minmax(70px, 120px) 1fr; gap: 2px 12px; align-items: baseline; padding: 8px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.pg-stale-row b { font-size: 18px; }
.pg-stale-row small { grid-column: 2; color: var(--muted); }
.pg-stale-act { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pg-weak-rule-foot a { color: var(--link, #1f82ae); font-size: 13px; }
</style>
