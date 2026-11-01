<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
const PERIODS: [number, string][] = [[7, 'Неделя'], [30, 'Месяц'], [0, 'Всё время']]
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

const groups = computed(() => groupReport(reply.value?.rows ?? []))
const t = computed(() => reply.value?.totals)
const answers = computed(() => (t.value ? t.value.ok + t.value.bad : 0))
const date = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
</script>

<template>
  <div class="rp">
    <div class="chips rp-per" role="group" aria-label="Период">
      <button v-for="[d, label] in PERIODS" :key="d" class="chip" :class="{ on: days === d }" @click="days = d">{{ label }}</button>
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
      <section v-for="g in groups" :key="g.source" class="rp-g">
        <h3>{{ g.name }} <small>{{ g.ok + g.bad }} отв. · верно {{ percent(g.ok, g.bad) }}% · около {{ spent(g.seconds) }}</small></h3>
        <table class="pg-tbl rp-tbl">
          <thead>
            <tr><th>Режим</th><th>Ответов</th><th>Верно</th><th>Ошибок</th><th class="rp-bar-h">Доля верных</th><th>Дней</th><th>Время</th><th>Последний раз</th></tr>
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
            </tr>
          </tbody>
        </table>
      </section>
      <p class="rp-note">Время по режимам примерное: считается по промежуткам между ответами. Время «по таймеру» точное, но общее.</p>
    </template>
  </div>
</template>

<style>
.study .rp-per { margin: 18px 0 22px; }
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
.rp-note { color: var(--muted); font-size: 13px; }
</style>
