<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
import LineChart from '@/components/charts/LineChart.vue'
import { errText, fetchT } from '@/lib/http'
import { percent } from '@/data/report'
import { useProgressStore } from '@/stores/progress'

/** Окно с графиком раздела или режима: линия с заливкой по дням, цифры и пояснение. */
const props = defineProps<{ source: string; mode?: string; title: string; days: number }>()
const emit = defineEmits<{ close: [] }>()

interface Reply {
  days: { day: string; ok: number; bad: number }[]
}
const progress = useProgressStore()
const data = ref<Reply['days'] | null>(null)
const failed = ref('')

onMounted(async () => {
  document.addEventListener('keydown', onKey)
  try {
    const q = new URLSearchParams({ source: props.source, days: String(props.days) })
    if (props.mode !== undefined) q.set('mode', props.mode || '-')
    const res = await fetchT(`/api/report/series?${q}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    data.value = ((await res.json()) as Reply).days
  } catch (e) {
    failed.value = errText(e)
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

const period = computed(() => (props.days === 7 ? 'за неделю' : props.days === 30 ? 'за месяц' : 'за всё время'))
const label = (d: string) => `${Number(d.slice(8))}.${d.slice(5, 7)}`
const labels = computed(() => (data.value ?? []).map(d => label(d.day)))
const series = computed(() => [
  { name: 'Всего ответов', values: (data.value ?? []).map(d => d.ok + d.bad), color: '#1f93cf' },
  { name: 'Верных', values: (data.value ?? []).map(d => d.ok), color: '#7a63e8' },
])
const stats = computed(() => {
  const d = data.value ?? []
  const ok = d.reduce((n, x) => n + x.ok, 0)
  const bad = d.reduce((n, x) => n + x.bad, 0)
  const active = d.filter(x => x.ok + x.bad > 0)
  const best = active.reduce<(typeof d)[number] | null>((b, x) => (!b || x.ok + x.bad > b.ok + b.bad ? x : b), null)
  return { ok, bad, all: ok + bad, pct: percent(ok, bad), activeDays: active.length, avg: active.length ? Math.round((ok + bad) / active.length) : 0, best }
})
</script>

<template>
  <Teleport to="body">
    <div class="rc" @click.self="emit('close')">
      <article class="rc-box study sky" role="dialog" aria-modal="true" :aria-label="`График: ${title}`">
        <button class="rc-x" type="button" aria-label="Закрыть" @click="emit('close')">✕</button>
        <header class="rc-head">
          <div>
            <div class="rc-kick"><Icon name="chart" /> график · {{ period }}</div>
            <h2>{{ title }}</h2>
          </div>
          <Cat name="think" class="rc-cat" />
        </header>

        <p v-if="failed" class="empty" role="alert">Не получилось загрузить: {{ failed }}</p>
        <p v-else-if="!data" class="empty">Загружаю…</p>
        <template v-else>
          <LineChart class="rc-chart" :title="`Ответы по дням, последние ${data.length} дн.`" :labels="labels" :series="series" unit="отв." />

          <div class="rc-sum">
            <div class="a"><b>{{ stats.all }}</b><small>ответов</small></div>
            <div class="b"><b>{{ stats.all ? stats.pct + '%' : '—' }}</b><small>верно: {{ stats.ok }} из {{ stats.all }}</small></div>
            <div class="c"><b>{{ stats.activeDays }}</b><small>дней с занятиями</small></div>
            <div class="d"><b>{{ stats.avg }}</b><small>ответов за день занятий</small></div>
          </div>

          <p v-if="stats.best" class="rc-best"><Icon name="goldstar" /> Рекорд: <b>{{ label(stats.best.day) }}</b>, {{ stats.best.ok + stats.best.bad }} ответов, верных {{ stats.best.ok }}.</p>

          <div class="rc-tip">
            <Icon name="bulb" />
            <p>Голубая линия с заливкой показывает все ответы за день, фиолетовая только верные. Чем ближе фиолетовая к голубой, тем меньше ошибок. Наведи курсор на график, чтобы увидеть цифры за день. Дни без занятий дают ноль.</p>
          </div>
        </template>
      </article>
    </div>
  </Teleport>
</template>

<style>
.rc { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 18px; overflow-y: auto; background: rgba(32, 38, 92, .45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.rc .rc-box.study { position: relative; min-height: 0; width: min(720px, 100%); max-height: calc(100vh - 36px); overflow-y: auto; padding: 24px 26px 22px;
  background: linear-gradient(160deg, #fff 0%, #fdf3fb 55%, #eef4ff 100%); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 30px 70px -20px rgba(80, 70, 160, .55); }
.rc-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(143, 124, 240, .12); color: var(--muted); font-size: 14px; cursor: pointer; transition: background .15s; }
.rc-x:hover { background: rgba(214, 77, 169, .18); color: var(--pink); }
.rc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 38px 14px 0; }
.rc-kick { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.rc .rc-box h2 { margin: 4px 0 0; font-family: inherit; font-size: 24px; font-weight: 700; line-height: 1.2; color: var(--ink); overflow-wrap: anywhere; }
.rc .rc-cat { flex: none; height: 84px; margin: -4px 0 -6px; }
.rc .rc-chart.ch { background: rgba(255, 255, 255, .85); border: 1px solid rgba(143, 124, 240, .22); border-radius: 20px; box-shadow: 0 10px 26px -18px rgba(80, 70, 160, .5); }
.rc-sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 10px; }
.rc-sum > div { border-radius: 16px; padding: 10px 12px; border: 1px solid rgba(255, 255, 255, .9); }
.rc-sum .a { background: #e6f1ff; } .rc-sum .b { background: #f1e9ff; } .rc-sum .c { background: #ffe9f5; } .rc-sum .d { background: #e9f8ee; }
.rc-sum b { display: block; font-size: 24px; font-weight: 700; line-height: 1.1; color: var(--ink); }
.rc-sum .b b { color: var(--pink); }
.rc-sum small { display: block; margin-top: 2px; font-size: 12px; line-height: 1.3; color: var(--muted); }
.rc-best { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; padding: 8px 14px; border-radius: 999px; background: rgba(255, 244, 214, .7); font-size: 13.5px; color: var(--ink); }
.rc-tip { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 16px; background: rgba(143, 124, 240, .08); border: 1px dashed rgba(143, 124, 240, .35); }
.rc-tip .ic-img { margin-top: 1px; }
.rc-tip p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
@media (max-width: 640px) { .rc-sum { grid-template-columns: repeat(2, 1fr); } .rc .rc-cat { height: 60px; } .rc .rc-box h2 { font-size: 20px; } }
</style>
