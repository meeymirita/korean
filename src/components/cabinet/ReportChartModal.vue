<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
      <article class="rc-box" role="dialog" aria-modal="true" :aria-label="`График: ${title}`">
        <button class="rc-x" type="button" aria-label="Закрыть" @click="emit('close')">✕</button>
        <h2>{{ title }}</h2>
        <p v-if="failed" class="empty" role="alert">Не получилось загрузить: {{ failed }}</p>
        <p v-else-if="!data" class="empty">Загружаю…</p>
        <template v-else>
          <LineChart :title="`Ответы по дням, последние ${data.length} дн.`" :labels="labels" :series="series" unit="отв." />
          <div class="rc-sum">
            <div><b>{{ stats.all }}</b><small>ответов</small></div>
            <div><b>{{ stats.all ? stats.pct + '%' : '—' }}</b><small>верно ({{ stats.ok }} из {{ stats.all }})</small></div>
            <div><b>{{ stats.activeDays }}</b><small>дней с занятиями</small></div>
            <div><b>{{ stats.avg }}</b><small>ответов в день занятий</small></div>
          </div>
          <p v-if="stats.best" class="rc-note">Больше всего ответов было {{ label(stats.best.day) }}: {{ stats.best.ok + stats.best.bad }}, из них верных {{ stats.best.ok }}.</p>
          <p class="rc-note">Как читать: голубая линия с заливкой — все ответы за день, фиолетовая — верные. Чем ближе фиолетовая к голубой, тем меньше ошибок. Наведи на график, чтобы увидеть цифры за день. Дни без занятий дают ноль.</p>
        </template>
      </article>
    </div>
  </Teleport>
</template>

<style>
.rc { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(30, 35, 80, .35); }
.rc-box { position: relative; width: min(680px, 100%); max-height: 92vh; overflow: auto; background: #fff; border-radius: 22px; padding: 22px 22px 18px; box-shadow: 0 24px 60px -12px rgba(80, 70, 160, .55); }
.rc-box h2 { margin: 0 34px 10px 0; font-size: 20px; }
.rc-x { position: absolute; top: 12px; right: 14px; border: 0; background: none; font-size: 18px; cursor: pointer; color: var(--muted); }
.rc-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 12px 0; }
.rc-sum > div { background: rgba(143, 124, 240, .08); border-radius: 12px; padding: 8px 12px; }
.rc-sum b { display: block; font-size: 20px; color: var(--pink, #d64da9); }
.rc-sum small { color: var(--muted); }
.rc-note { color: var(--muted); font-size: 13px; margin: 6px 0 0; }
</style>
