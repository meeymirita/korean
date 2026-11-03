<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AnalyticsPanel from '@/components/cabinet/AnalyticsPanel.vue'
import ReportChartModal from '@/components/cabinet/ReportChartModal.vue'
import { usePersisted } from '@/composables/usePersisted'
import { groupReport, percent, spent, type ReportRow } from '@/data/report'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

interface Reply {
  days: number
  totals: { ok: number; bad: number; activeDays: number; seconds: number }
  rows: ReportRow[]
}

const progress = useProgressStore()
const PERIODS: [number, string][] = [[7, '7 дней'], [30, '30 дней'], [0, 'Всё время']]
/** Что показывает выбранный период: подпись под кнопками, чтобы не гадать. */
const PERIOD_TEXT: Record<number, string> = {
  7: 'Цифры и графики ниже только за последние 7 дней, включая сегодня.',
  30: 'Цифры и графики ниже только за последние 30 дней, включая сегодня.',
  0: 'Цифры и графики ниже за всё время, с первого ответа.',
}
const days = usePersisted('report_days', 30, v => PERIODS.some(p => p[0] === v))
const reply = ref<Reply | null>(null)
const failed = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await fetchT(`/api/report?days=${days.value}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(res.status === 403 ? 'отчёт виден только владельцу' : `ошибка сервера ${res.status}`)
    reply.value = (await res.json()) as Reply
    failed.value = ''
  } catch (e) {
    failed.value = errText(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(days, load)

/** Какой график открыт: раздел целиком (mode не задан) или один режим. */
const chart = ref<{ source: string; mode?: string; title: string } | null>(null)
const groups = computed(() => groupReport(reply.value?.rows ?? []))
/** Раскрытые разделы (запоминаются); пока ничего не выбрано, открыт только самый большой. */
const openSaved = usePersisted<string[] | null>('report_open', null, v => v === null || (Array.isArray(v) && v.every(x => typeof x === 'string')))
const isOpen = (s: string) => (openSaved.value ?? groups.value.slice(0, 1).map(g => g.source)).includes(s)
function toggle(s: string) {
  const cur = openSaved.value ?? groups.value.slice(0, 1).map(g => g.source)
  openSaved.value = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]
}
const setAll = (open: boolean) => (openSaved.value = open ? groups.value.map(g => g.source) : [])
const t = computed(() => reply.value?.totals)
const answers = computed(() => (t.value ? t.value.ok + t.value.bad : 0))
const date = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="rp">
    <div class="rp-per">
      <div class="chips" role="group" aria-label="За какой период показать отчёт">
        <span class="rp-per-t">Период отчёта:</span>
        <button v-for="[d, label] in PERIODS" :key="d" class="chip" :class="{ on: days === d }" :aria-pressed="days === d" @click="days = d">{{ label }}</button>
      </div>
      <p class="rp-per-d">{{ PERIOD_TEXT[days] }}</p>
    </div>

    <p v-if="failed" class="empty" role="alert">Не получилось загрузить отчёт: {{ failed }}</p>
    <p v-else-if="!reply" class="empty">{{ loading ? 'Загружаю…' : '' }}</p>
    <template v-else>
      <div class="rp-sum">
        <div><b>{{ t!.activeDays }}</b><small>дней занятий</small></div>
        <div><b>{{ spent(t!.seconds) }}</b><small>время по таймеру</small></div>
        <div><b>{{ answers }}</b><small>ответов</small></div>
        <div><b>{{ answers ? percent(t!.ok, t!.bad) + '%' : '—' }}</b><small>верно: {{ t!.ok }}, ошибок: {{ t!.bad }}</small></div>
      </div>

      <p v-if="!groups.length" class="empty">За этот период ответов нет. Поиграй или пройди «Сегодня»: отчёт появится сам.</p>
      <div v-if="groups.length > 1" class="rp-all">
        <button type="button" class="rp-link" @click="setAll(true)">Развернуть всё</button>
        <button type="button" class="rp-link" @click="setAll(false)">Свернуть всё</button>
      </div>
      <section v-for="g in groups" :key="g.source" class="rp-g" :class="{ shut: !isOpen(g.source) }">
        <h3>
          <button type="button" class="rp-toggle" :aria-expanded="isOpen(g.source)" @click="toggle(g.source)">
            <span class="rp-chev" aria-hidden="true">▸</span>{{ g.name }} <small>{{ g.ok + g.bad }} отв. · верно {{ percent(g.ok, g.bad) }}% · около {{ spent(g.seconds) }}</small>
          </button> <button type="button" class="rp-gbtn" @click="chart = { source: g.source, title: g.name }">график</button></h3>
        <table v-show="isOpen(g.source)" class="pg-tbl rp-tbl">
          <thead>
            <tr><th>Режим</th><th>Ответов</th><th>Верно</th><th>Ошибок</th><th class="rp-bar-h">Доля верных</th><th>Дней</th><th>Время</th><th>Последний раз</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="r in g.rows" :key="r.mode">
              <td>{{ r.name }}</td>
              <td>{{ r.ok + r.bad }}</td>
              <td>{{ r.ok }}</td>
              <td>{{ r.bad }}</td>
              <td class="rp-bar-c"><span class="rp-bar" :title="percent(r.ok, r.bad) + '%'"><i :style="{ width: percent(r.ok, r.bad) + '%' }"></i></span> {{ percent(r.ok, r.bad) }}%</td>
              <td>{{ r.days }}</td>
              <td>{{ spent(r.seconds) }}</td>
              <td>{{ date(r.last) }}</td>
              <td><button type="button" class="rp-gbtn" @click="chart = { source: g.source, mode: r.mode, title: `${g.name}: ${r.name}` }">график</button></td>
            </tr>
          </tbody>
        </table>
      </section>
      <p class="rp-note">Время по режимам примерное: считается по промежуткам между ответами. Время «по таймеру» точное, но общее.</p>

      <AnalyticsPanel :groups="groups" :days="days" />
    </template>
    <ReportChartModal v-if="chart" :source="chart.source" :mode="chart.mode" :title="chart.title" :days="days" @close="chart = null" />
  </div>
</template>

<style>
.study .rp-per { margin: 18px 0 22px; }
.study .rp-per .chips { align-items: center; margin-top: 0; }
.study .rp-per-t { font-size: 13.5px; font-weight: 600; color: var(--muted); }
.study .rp-per-d { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
.rp-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }
.rp-sum > div { background: rgba(255, 255, 255, .6); border: 1px solid rgba(143, 124, 240, .25); border-radius: 14px; padding: 12px 14px; }
.rp-sum b { display: block; font-size: 24px; color: var(--pink, #d64da9); }
.rp-sum small { color: var(--muted); }
.rp-g { margin-bottom: 20px; overflow-x: auto; }
.rp-g h3 { margin: 0 0 6px; font-size: 17px; }
.rp-g h3 small { color: var(--muted); font-weight: 400; margin-left: 6px; }
.rp-tbl th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12px; padding: 4px 10px 4px 0; white-space: nowrap; }
.rp-tbl td { padding: 5px 10px 5px 0; white-space: nowrap; }
.rp-bar { display: inline-block; width: 70px; height: 8px; border-radius: 4px; background: rgba(143, 124, 240, .18); vertical-align: middle; overflow: hidden; margin-right: 6px; }
.rp-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f7a8d4, #9ec8ff); }
.rp-all { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 20px; }
.study .rp-link { padding: 4px 14px; border: 1px solid rgba(143, 124, 240, .3); border-radius: 999px; background: rgba(255, 255, 255, .7); font-size: 13px; font-weight: 400; color: var(--muted); transition: background .15s, border-color .15s, color .15s; }
.study .rp-link:hover { background: rgba(214, 77, 169, .08); border-color: rgba(214, 77, 169, .45); color: var(--pink, #d64da9); }
.study .rp-link:focus-visible { outline: 2px solid rgba(214, 77, 169, .5); outline-offset: 2px; }
.study .rp-toggle { display: inline-flex; align-items: baseline; gap: 6px; padding: 0; border: 0; background: none; font: inherit; text-align: left; color: inherit; }
.rp-chev { display: inline-block; width: 1em; color: var(--pink, #d64da9); transition: transform .18s; }
.rp-toggle[aria-expanded='true'] .rp-chev { transform: rotate(90deg); }
.rp-g.shut { margin-bottom: 10px; }
.study .rp-gbtn { font-family: inherit; font-size: 12px; font-weight: 400; line-height: 1.5; letter-spacing: 0; text-transform: none; vertical-align: middle; margin-left: 8px; padding: 1px 11px; border: 1px solid rgba(214, 77, 169, .3); border-radius: 999px;
  background: rgba(214, 77, 169, .06); color: var(--pink, #d64da9); cursor: pointer; transition: background .15s, border-color .15s; }
.study .rp-gbtn:hover { background: rgba(214, 77, 169, .14); border-color: rgba(214, 77, 169, .55); }
.study .rp-gbtn:focus-visible { outline: 2px solid rgba(214, 77, 169, .5); outline-offset: 2px; }
.study .rp-tbl .rp-gbtn { margin-left: 0; }
.rp-note { color: var(--muted); font-size: 13px; }
</style>
