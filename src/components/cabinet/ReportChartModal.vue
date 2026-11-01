<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
/* ---------- список самих ответов справа ---------- */
interface Item {
  t: number
  w: string | null
  ok: boolean
  d?: { q?: string; a?: string; y?: string }
}
const only = ref<'' | 'bad' | 'ok'>('bad')
const list = ref<{ items: Item[]; ok: number; bad: number } | null>(null)
const listFailed = ref('')
async function loadList() {
  try {
    const q = new URLSearchParams({ source: props.source, days: String(props.days) })
    if (props.mode !== undefined) q.set('mode', props.mode || '-')
    if (only.value) q.set('only', only.value)
    const res = await fetchT(`/api/report/answers?${q}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    list.value = (await res.json()) as { items: Item[]; ok: number; bad: number }
    listFailed.value = ''
  } catch (e) {
    listFailed.value = errText(e)
  }
}
onMounted(loadList)
watch(only, loadList)
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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
        <div v-else class="rc-cols">
         <div class="rc-left">
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
         </div>

         <aside class="rc-right" aria-label="Ответы">
          <div class="rc-rh">
            <h3>Ответы</h3>
            <div class="rc-seg" role="group" aria-label="Какие показать">
              <button type="button" :class="{ on: only === 'bad' }" @click="only = 'bad'">Ошибки{{ list ? ` · ${list.bad}` : '' }}</button>
              <button type="button" :class="{ on: only === 'ok' }" @click="only = 'ok'">Верные{{ list ? ` · ${list.ok}` : '' }}</button>
              <button type="button" :class="{ on: only === '' }" @click="only = ''">Все</button>
            </div>
          </div>
          <p v-if="listFailed" class="empty" role="alert">Не получилось загрузить: {{ listFailed }}</p>
          <p v-else-if="!list" class="empty">Загружаю…</p>
          <p v-else-if="!list.items.length" class="rc-none">{{ only === 'bad' ? 'Ошибок за этот период нет.' : only === 'ok' ? 'Верных ответов за этот период нет.' : 'Ответов за этот период нет.' }}</p>
          <ul v-else class="rc-list">
            <li v-for="(a, i) in list.items" :key="i" :class="a.ok ? 'ok' : 'bad'">
              <span class="rc-mark" aria-hidden="true">{{ a.ok ? '✓' : '✕' }}</span>
              <div>
                <b class="ko">{{ a.d?.q ?? a.w ?? 'без слова' }}</b>
                <span v-if="a.d?.a" class="rc-ans">верно: <i class="ko">{{ a.d.a }}</i></span>
                <span v-if="!a.ok && a.d?.y" class="rc-ans wrong">ты ответил: <i class="ko">{{ a.d.y }}</i></span>
                <time>{{ when(a.t) }}</time>
              </div>
            </li>
          </ul>
          <p v-if="list && list.items.length >= 300" class="rc-more">Показаны последние 300.</p>
         </aside>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style>
.rc { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 18px; overflow-y: auto; background: rgba(32, 38, 92, .45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.rc .rc-box.study { position: relative; min-height: 0; width: min(1080px, 100%); max-height: calc(100vh - 36px); overflow-y: auto; padding: 24px 26px 22px;
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
.rc-cols { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, 1fr); gap: 18px; align-items: start; }
.rc-right { display: flex; flex-direction: column; min-height: 0; max-height: calc(100vh - 170px); padding: 14px 14px 10px; border-radius: 20px; background: rgba(255, 255, 255, .7); border: 1px solid rgba(143, 124, 240, .22); }
.rc-rh h3 { margin: 0 0 8px; font-family: inherit; font-size: 16px; font-weight: 700; color: var(--ink); }
.rc-seg { display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: rgba(143, 124, 240, .1); margin-bottom: 10px; }
.study .rc-seg button { flex: 1; padding: 4px 8px; border: 0; border-radius: 999px; background: none; font-size: 12.5px; color: var(--muted); white-space: nowrap; }
.study .rc-seg button.on { background: #fff; color: var(--pink); box-shadow: 0 2px 8px -3px rgba(80, 70, 160, .4); }
.rc-list { list-style: none; margin: 0; padding: 0 4px 0 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.rc-list li { display: flex; gap: 10px; padding: 8px 10px; border-radius: 14px; background: #fff; border: 1px solid rgba(143, 124, 240, .14); }
.rc-list li.bad { background: #fff6fa; border-color: rgba(214, 77, 169, .22); }
.rc-mark { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; margin-top: 1px; }
.rc-list .ok .rc-mark { background: #dff5e7; color: #2c7a4b; }
.rc-list .bad .rc-mark { background: #ffe0ee; color: #c23b86; }
.rc-list b { display: block; font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
.rc-ans { display: block; font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }
.rc-ans i { font-style: normal; color: var(--ink); }
.rc-ans.wrong i { color: #c23b86; }
.rc-list time { display: block; margin-top: 2px; font-size: 11px; color: var(--muted); opacity: .8; }
.rc-none, .rc-more { margin: 6px 2px; font-size: 13px; color: var(--muted); }
@media (max-width: 860px) { .rc-cols { grid-template-columns: 1fr; } .rc-right { max-height: 420px; } }
@media (max-width: 640px) { .rc-sum { grid-template-columns: repeat(2, 1fr); } .rc .rc-cat { height: 60px; } .rc .rc-box h2 { font-size: 20px; } }
</style>
