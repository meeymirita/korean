<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import LineChart from '@/components/charts/LineChart.vue'
import { ACHIEVEMENTS } from '@/data/achievements'
import { D } from '@/data/korean/words'
import { mistakeCatOf, MISTAKE_CAT_NAMES, percent, type ReportGroup } from '@/data/report'
import { achievedAt } from '@/lib/achievedDates'
import { vocabForecast } from '@/lib/forecast'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

const props = defineProps<{ groups: ReportGroup[]; days: number }>()
const progress = useProgressStore()

/* ---------- 1. тепловая карта тем по % ошибок ---------- */
const topics = computed(() =>
  props.groups
    .flatMap(g => g.rows.map(r => ({ key: g.source + ':' + r.mode, name: r.name, group: g.name, ok: r.ok, bad: r.bad })))
    .filter(t => t.ok + t.bad >= 3)
    .map(t => ({ ...t, pct: percent(t.ok, t.bad), errPct: 100 - percent(t.ok, t.bad) }))
    .sort((a, b) => b.errPct - a.errPct),
)
const heatLevel = (errPct: number) => (errPct >= 40 ? 4 : errPct >= 25 ? 3 : errPct >= 12 ? 2 : errPct > 0 ? 1 : 0)

/* ---------- 2. эта неделя vs прошлая ---------- */
interface WeekSide { ok: number; bad: number; seconds: number }
const weeks = ref<{ cur: WeekSide; prev: WeekSide } | null>(null)
const weeksFailed = ref('')
onMounted(async () => {
  try {
    const res = await fetchT('/api/report/weeks', { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    weeks.value = (await res.json()) as { cur: WeekSide; prev: WeekSide }
  } catch (e) {
    weeksFailed.value = errText(e)
  }
})
const weekText = computed(() => {
  if (!weeks.value) return ''
  const { cur, prev } = weeks.value
  const curAll = cur.ok + cur.bad
  const prevAll = prev.ok + prev.bad
  if (!curAll && !prevAll) return 'На этой и прошлой неделе занятий не было.'
  if (!prevAll) return `На этой неделе ${curAll} ответов, верно ${percent(cur.ok, cur.bad)}%. На прошлой неделе занятий не было — не с чем сравнить.`
  const diffAll = curAll - prevAll
  const partsAll = diffAll === 0 ? 'столько же ответов' : `${diffAll > 0 ? 'на ' + diffAll + ' ответов больше' : 'на ' + -diffAll + ' ответов меньше'}`
  const curPct = percent(cur.ok, cur.bad)
  const prevPct = percent(prev.ok, prev.bad)
  const diffPct = curPct - prevPct
  const partsPct = diffPct === 0 ? 'доля верных та же' : `ошибок ${diffPct > 0 ? 'на ' + diffPct + ' % меньше' : 'на ' + -diffPct + ' % больше'}`
  return `На этой неделе ${partsAll}, чем на прошлой (${curAll} против ${prevAll}), и ${partsPct} (сейчас верно ${curPct}%, было ${prevPct}%).`
})

/* ---------- 3. прогноз «когда выучишь весь словарь» ---------- */
const forecast = computed(() => vocabForecast(progress.data.words, D.length))

/* ---------- 4. время суток ошибок ---------- */
const clock = ref<{ hours: { ok: number; bad: number }[] } | null>(null)
const clockFailed = ref('')
async function loadClock() {
  try {
    const res = await fetchT(`/api/report/clock?days=${props.days || 90}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    clock.value = (await res.json()) as { hours: { ok: number; bad: number }[] }
  } catch (e) {
    clockFailed.value = errText(e)
  }
}
onMounted(loadClock)
const clockLabels = Array.from({ length: 24 }, (_, h) => String(h))
const clockHasData = computed(() => (clock.value?.hours ?? []).some(h => h.ok + h.bad > 0))
const clockSeries = computed(() => [
  { name: 'Ответов', values: (clock.value?.hours ?? []).map(h => h.ok + h.bad), color: '#1f93cf' },
  { name: 'Ошибок', values: (clock.value?.hours ?? []).map(h => h.bad), color: '#d64da9' },
])
const worstHour = computed(() => {
  const hs = clock.value?.hours ?? []
  let best = -1
  let bestPct = -1
  hs.forEach((h, i) => {
    if (h.ok + h.bad < 5) return
    const p = 100 - percent(h.ok, h.bad)
    if (p > bestPct) { bestPct = p; best = i }
  })
  return best >= 0 ? { hour: best, errPct: bestPct } : null
})

/* ---------- 5. дневник ошибок с фильтром по типу ---------- */
interface DiaryItem { t: number; w: string | null; ok: boolean; source: string; mode: string; d?: { q?: string; a?: string; y?: string } }
const diary = ref<DiaryItem[] | null>(null)
const diaryFailed = ref('')
async function loadDiary() {
  try {
    const res = await fetchT(`/api/report/answers?only=bad&days=${props.days || 90}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    diary.value = ((await res.json()) as { items: DiaryItem[] }).items
  } catch (e) {
    diaryFailed.value = errText(e)
  }
}
onMounted(loadDiary)
const diaryCat = ref('Все')
const DIARY_PAGE = 20
const diaryLimit = ref(DIARY_PAGE)
watch(diaryCat, () => (diaryLimit.value = DIARY_PAGE))
const diaryFiltered = computed(() => {
  const items = diary.value ?? []
  return diaryCat.value === 'Все' ? items : items.filter(i => mistakeCatOf(i.mode) === diaryCat.value)
})
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/* ---------- 6. таймлайн прогресса ---------- */
const timeline = computed(() => {
  const items: { t: number; icon: string; title: string }[] = []
  const firstDay = Object.keys(progress.data.days).sort()[0]
  if (firstDay) items.push({ t: new Date(firstDay + 'T12:00:00').getTime(), icon: 'sprout', title: 'Первое занятие' })
  for (const a of ACHIEVEMENTS) {
    const t = achievedAt(a.id)
    if (t) items.push({ t, icon: a.icon, title: a.title })
  }
  return items.sort((a, b) => a.t - b.t)
})
const timelineDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/* ---------- 7. экспорт месячного отчёта ---------- */
const print = () => window.print()
</script>

<template>
  <div class="an">
    <h2 class="today-h">Прогресс и аналитика</h2>

    <section class="an-s">
      <h3><Icon name="chart" /> Тепловая карта тем по ошибкам</h3>
      <p v-if="!topics.length" class="an-empty">Пока мало ответов по режимам, чтобы выделить проблемные темы (нужно хотя бы 3 ответа на тему).</p>
      <div v-else class="an-heat">
        <span v-for="t in topics" :key="t.key" class="an-tile" :class="'h' + heatLevel(t.errPct)" :title="`${t.group} · ${t.name}: ошибок ${t.errPct}% из ${t.ok + t.bad} ответов`">
          {{ t.name }} <b>{{ t.errPct }}%</b>
        </span>
      </div>
      <p class="an-leg">меньше ошибок <i class="an-tile h0"></i><i class="an-tile h1"></i><i class="an-tile h2"></i><i class="an-tile h3"></i><i class="an-tile h4"></i> больше</p>
    </section>

    <section class="an-s">
      <h3><Icon name="comet" /> Эта неделя vs прошлая</h3>
      <p v-if="weeksFailed" class="an-empty" role="alert">Не получилось загрузить: {{ weeksFailed }}</p>
      <p v-else-if="!weeks" class="an-empty">Загружаю…</p>
      <p v-else class="an-text">{{ weekText }}</p>
    </section>

    <section class="an-s">
      <h3><Icon name="telescope" /> Когда выучишь весь словарь</h3>
      <p class="an-text">
        Выучено <b>{{ forecast.learned }}</b> из {{ forecast.total }} слов.
        <template v-if="forecast.eta"> При темпе {{ forecast.perWeek }} слов в неделю весь словарь будет выучен {{ forecast.eta }}.</template>
        <template v-else-if="forecast.learned >= forecast.total"> Весь словарь уже выучен!</template>
        <template v-else> Пока рано строить прогноз — за последний месяц не было новых выученных слов.</template>
      </p>
    </section>

    <section class="an-s">
      <h3><Icon name="sun" /> В какое время суток больше ошибок</h3>
      <p v-if="clockFailed" class="an-empty" role="alert">Не получилось загрузить: {{ clockFailed }}</p>
      <p v-else-if="!clock" class="an-empty">Загружаю…</p>
      <p v-else-if="!clockHasData" class="an-empty">За этот период ответов нет.</p>
      <template v-else>
        <LineChart title="Ответы по часу дня (0–23)" :labels="clockLabels" :series="clockSeries" unit="отв." />
        <p v-if="worstHour" class="an-text">Больше всего ошибок в районе <b>{{ worstHour.hour }}:00</b> — ошибается примерно в {{ worstHour.errPct }}% ответов в этот час.</p>
      </template>
    </section>

    <section class="an-s">
      <h3><Icon name="notebook" /> Дневник ошибок</h3>
      <div class="chips an-chips">
        <button v-for="c in MISTAKE_CAT_NAMES" :key="c" type="button" class="chip" :class="{ on: diaryCat === c }" @click="diaryCat = c">{{ c }}</button>
      </div>
      <p v-if="diaryFailed" class="an-empty" role="alert">Не получилось загрузить: {{ diaryFailed }}</p>
      <p v-else-if="!diary" class="an-empty">Загружаю…</p>
      <p v-else-if="!diaryFiltered.length" class="an-empty">Ошибок по этому фильтру за период нет.</p>
      <ul v-else class="an-diary">
        <li v-for="(a, i) in diaryFiltered.slice(0, diaryLimit)" :key="i">
          <b class="ko">{{ a.d?.q ?? a.w ?? 'без слова' }}</b>
          <span v-if="a.d?.a" class="an-ans">верно: <i class="ko">{{ a.d.a }}</i></span>
          <span v-if="a.d?.y" class="an-ans wrong">ты ответил: <i class="ko">{{ a.d.y }}</i></span>
          <time>{{ when(a.t) }}</time>
        </li>
      </ul>
      <div v-if="diaryFiltered.length > diaryLimit" class="an-more">
        <button type="button" class="chip" @click="diaryLimit += DIARY_PAGE">Показать ещё {{ Math.min(DIARY_PAGE, diaryFiltered.length - diaryLimit) }}</button>
        <span class="an-leg">показано {{ diaryLimit }} из {{ diaryFiltered.length }}</span>
      </div>
    </section>

    <section class="an-s">
      <h3><Icon name="trophy" /> Таймлайн прогресса</h3>
      <p v-if="!timeline.length" class="an-empty">Пока пусто: начни заниматься, и здесь появятся даты и достижения.</p>
      <ul v-else class="an-tl">
        <li v-for="(x, i) in timeline" :key="i"><Icon :name="x.icon" /> <b>{{ x.title }}</b><time>{{ timelineDate(x.t) }}</time></li>
      </ul>
    </section>

    <section class="an-s">
      <h3><Icon name="notebook" /> Экспорт отчёта</h3>
      <p class="an-text">Печать или сохранение в PDF (в окне печати выбери «Сохранить как PDF»): сводка за выбранный период со всеми блоками выше.</p>
      <button type="button" class="chip" @click="print">Печать / PDF</button>
    </section>

    <div class="print-sheet">
      <h1>Отчёт по занятиям 우리말</h1>
      <p>{{ new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
      <h2>Темы с наибольшей долей ошибок</h2>
      <table><tbody><tr v-for="t in topics.slice(0, 15)" :key="t.key"><td>{{ t.group }} · {{ t.name }}</td><td>{{ t.errPct }}% ошибок из {{ t.ok + t.bad }}</td></tr></tbody></table>
      <h2>Эта неделя vs прошлая</h2>
      <p>{{ weekText }}</p>
      <h2>Прогноз</h2>
      <p>Выучено {{ forecast.learned }} из {{ forecast.total }} слов{{ forecast.eta ? ', весь словарь ' + forecast.eta : '' }}.</p>
    </div>
  </div>
</template>

<style>
.an-s { margin: 22px 0; }
.an-s h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 16px; }
.an-empty { color: var(--muted); font-size: 14px; }
.an-text { font-size: 14.5px; line-height: 1.55; }
.an-heat { display: flex; flex-wrap: wrap; gap: 8px; }
.an-tile { padding: 6px 12px; border-radius: 10px; font-size: 12.5px; background: #eef1fb; color: var(--ink); }
.an-tile.h0 { background: #e6f6ec; } .an-tile.h1 { background: #fff2cf; } .an-tile.h2 { background: #ffd9a0; } .an-tile.h3 { background: #ffac9e; } .an-tile.h4 { background: #ff7b9c; color: #fff; }
.an-tile b { margin-left: 4px; }
.an-leg { display: flex; align-items: center; gap: 4px; margin: 8px 0 0; font-size: 12px; color: var(--muted); }
.an-leg .an-tile { width: 18px; height: 12px; padding: 0; }
.study .an-chips { margin-bottom: 16px; }
.an-more { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.an-more .an-leg { margin: 0; }
.an-diary { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-width: 640px; }
.an-diary li { padding: 8px 10px; border-radius: 12px; background: #fff6fa; border: 1px solid rgba(214, 77, 169, .18); font-size: 13.5px; }
.an-diary b { display: block; }
.an-ans { display: block; font-size: 12.5px; color: var(--muted); }
.an-ans.wrong i { color: #c23b86; font-style: normal; }
.an-ans i { font-style: normal; color: var(--ink); }
.an-diary time { display: block; margin-top: 2px; font-size: 11px; color: var(--muted); opacity: .8; }
.an-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.an-tl li { display: flex; align-items: baseline; gap: 8px; }
.an-tl time { color: var(--muted); font-size: 12.5px; }
.print-sheet { display: none; }
@media print {
  body * { visibility: hidden; }
  .study .print-sheet, .study .print-sheet * { visibility: visible; }
  .study .print-sheet { display: block; position: absolute; left: 0; top: 0; width: 100%; padding: 24px; color: #000; background: #fff; }
  .study .print-sheet table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .study .print-sheet td { padding: 6px 8px; border-bottom: 1px solid #ccc; }
}
</style>
