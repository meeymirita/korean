<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePersisted } from '@/composables/usePersisted'
import { modeName, percent, sourceName, type ReportGroup } from '@/data/report'
import { groupSessions, lasted, type AnswerItem, type Session } from '@/data/sessions'
import { D } from '@/data/korean/words'
import { short } from '@/data/korean/tasks'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

/** Занятия по режимам: каждое раскрывается в полный список ответов (время, вопрос, верный ответ, твой ответ, как отвечал). */
const props = defineProps<{ groups: ReportGroup[]; days: number }>()
const progress = useProgressStore()

/** Выбранный режим: «раздел|режим», пусто — все режимы сразу. */
const pickedKey = usePersisted('report_sessions_mode', '', v => typeof v === 'string')
const modes = computed(() => props.groups.flatMap(g => g.rows.map(r => ({ key: `${g.source}|${r.mode}`, source: g.source, mode: r.mode, label: r.mode ? r.name : g.name, group: g.name, n: r.ok + r.bad }))))
const picked = computed(() => modes.value.find(m => m.key === pickedKey.value))

const PAGE = 1000
const limit = ref(PAGE)
const items = ref<AnswerItem[] | null>(null)
const failed = ref('')
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    const q = new URLSearchParams({ days: String(props.days), limit: String(limit.value) })
    if (picked.value) {
      q.set('source', picked.value.source)
      q.set('mode', picked.value.mode || '-')
    }
    const res = await fetchT(`/api/report/answers?${q}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(`ошибка сервера ${res.status}`)
    items.value = ((await res.json()) as { items: AnswerItem[] }).items
    failed.value = ''
  } catch (e) {
    failed.value = errText(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch([() => props.days, () => picked.value?.key], () => {
  limit.value = PAGE
  open.value = null
  void load()
})
function more() {
  limit.value += PAGE
  void load()
}

const sessions = computed(() => groupSessions(items.value ?? []))
const only = ref<'' | 'bad'>('')
/** Раскрытые занятия (по времени начала и режиму); пока ничего не трогали, открыто первое. */
const open = ref<Set<string> | null>(null)
const idOf = (s: Session) => `${s.start}|${s.source}|${s.mode}`
const isOpen = (s: Session) => (open.value ? open.value.has(idOf(s)) : s === sessions.value[0])
function toggle(s: Session) {
  const cur = new Set(open.value ?? sessions.value.slice(0, 1).map(idOf))
  if (cur.has(idOf(s))) cur.delete(idOf(s))
  else cur.add(idOf(s))
  open.value = cur
}
const setAll = (v: boolean) => (open.value = new Set(v ? sessions.value.map(idOf) : []))

const day = (ms: number) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
const hm = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const hms = (ms: number) => new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const rows = (s: Session) => (only.value === 'bad' ? s.items.filter(a => !a.ok) : s.items)
const hasHow = (s: Session) => s.items.some(a => a.d?.n)
const title = (s: Session) => (s.mode ? `${sourceName(s.source)}: ${modeName(s.mode)}` : sourceName(s.source))
/** Перевод слова из словаря: подпись под вопросом, если её нет в самом вопросе. */
const byK = new Map(D.map(d => [d.k, short(d.t)]))
const wordNote = (a: AnswerItem) => {
  const t = a.w ? byK.get(a.w) : undefined
  // вопрос и есть само слово: перевод уже стоит в «Верном ответе»
  if (!a.w || !t || a.d?.q === a.w) return ''
  return `${a.w} — ${t}`
}
</script>

<template>
  <section class="rs">
    <h2 class="rs-h">Занятия</h2>
    <p class="rs-d">Каждый раунд или серия отдельной строкой. Нажми, чтобы раскрыть: время, вопрос, верный ответ, твой ответ и как отвечал.</p>

    <div class="chips rs-modes" role="group" aria-label="Режим">
      <button type="button" class="chip" :class="{ on: !picked }" @click="pickedKey = ''">Все режимы</button>
      <button v-for="m in modes" :key="m.key" type="button" class="chip" :class="{ on: picked?.key === m.key }" :title="m.group" @click="pickedKey = m.key">{{ m.label }} · {{ m.n }}</button>
    </div>

    <div class="rs-top">
      <span class="rs-count">занятий: {{ sessions.length }}<template v-if="items"> · ответов: {{ items.length }}</template></span>
      <div class="chips">
        <button type="button" class="chip" :class="{ on: only === '' }" @click="only = ''">Все ответы</button>
        <button type="button" class="chip" :class="{ on: only === 'bad' }" @click="only = 'bad'">Только ошибки</button>
        <button type="button" class="chip" @click="setAll(true)">Развернуть всё</button>
        <button type="button" class="chip" @click="setAll(false)">Свернуть всё</button>
      </div>
    </div>

    <p v-if="failed" class="empty" role="alert">Не получилось загрузить: {{ failed }}</p>
    <p v-else-if="!items" class="empty">Загружаю…</p>
    <p v-else-if="!sessions.length" class="empty">За этот период занятий нет.</p>
    <section v-for="s in sessions" :key="idOf(s)" class="rs-s" :class="{ shut: !isOpen(s) }">
      <button type="button" class="rs-head" :aria-expanded="isOpen(s)" @click="toggle(s)">
        <span class="rs-chev" aria-hidden="true">▸</span>
        <b>{{ day(s.start) }}, {{ hm(s.start) }}</b>
        <span class="rs-mode">{{ title(s) }}</span>
        <span>{{ s.ok + s.bad }} отв.</span>
        <span class="rs-ok">верно {{ s.ok }}</span>
        <span :class="{ 'rs-bad': s.bad }">ошибок {{ s.bad }}</span>
        <span>{{ percent(s.ok, s.bad) }}%</span>
        <span>{{ lasted(s.end - s.start) }}</span>
      </button>
      <div v-if="isOpen(s)" class="rs-wrap">
        <table class="rs-tbl">
          <thead>
            <tr><th>Время</th><th></th><th>Вопрос</th><th>Верный ответ</th><th>Твой ответ</th><th v-if="hasHow(s)">Как</th></tr>
          </thead>
          <tbody>
            <tr v-for="(a, i) in rows(s)" :key="i" :class="a.ok ? 'ok' : 'bad'">
              <td class="rs-t">{{ hms(a.t) }}</td>
              <td class="rs-m">{{ a.ok ? '✓' : '✕' }}</td>
              <td class="ko rs-q">{{ a.d?.q ?? a.w ?? 'нет записи' }}<small v-if="wordNote(a)">{{ wordNote(a) }}</small></td>
              <td class="ko">{{ a.d?.a ?? '—' }}</td>
              <td class="ko rs-y">{{ a.ok ? (a.d?.a ?? 'верно') : (a.d?.y ?? 'неверно') }}</td>
              <td v-if="hasHow(s)" class="rs-n">{{ a.d?.n ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows(s).length" class="rs-none">В этом занятии ошибок нет.</p>
      </div>
    </section>
    <div v-if="items && items.length >= limit" class="rs-more">
      <button type="button" class="chip" :disabled="loading" @click="more">{{ loading ? 'Загружаю…' : 'Показать более ранние' }}</button>
      <span class="rs-count">показаны последние {{ items.length }} ответов</span>
    </div>
  </section>
</template>

<style>
.study .rs { margin: 30px 0 34px; }
.study .rs-h { margin: 0 0 4px; font-size: 22px; }
.study .rs-d { margin: 0 0 12px; font-size: 13.5px; color: var(--muted); }
.study .rs-modes { margin: 0 0 14px; }
.rs-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-bottom: 12px; }
.study .rs-top .chips { margin-top: 0; }
.rs-count { font-size: 13px; color: var(--muted); }
.rs-s { margin-bottom: 10px; border: 1px solid rgba(143, 124, 240, .25); border-radius: 16px; background: rgba(255, 255, 255, .7); overflow: hidden; }
.study .rs-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; width: 100%; padding: 12px 16px; border: 0; background: none; font: inherit; font-size: 13.5px; text-align: left; color: var(--muted); }
.rs-head b { font-size: 15px; color: var(--ink); }
.rs-head .rs-mode { font-weight: 600; color: var(--pink, #d64da9); }
.rs-head .rs-ok { color: #2f8f5b; }
.rs-head .rs-bad { color: #c23b86; font-weight: 600; }
.rs-chev { display: inline-block; color: var(--pink, #d64da9); transition: transform .18s; }
.rs-head[aria-expanded='true'] .rs-chev { transform: rotate(90deg); }
.rs-wrap { padding: 0 16px 12px; overflow-x: auto; }
.rs-tbl { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.rs-tbl th { padding: 4px 12px 6px 0; text-align: left; font-size: 12px; font-weight: 500; color: var(--muted); white-space: nowrap; }
.rs-tbl td { padding: 6px 12px 6px 0; vertical-align: top; border-top: 1px solid rgba(143, 124, 240, .14); overflow-wrap: anywhere; }
.rs-tbl .rs-t { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--muted); }
.rs-tbl .rs-m { font-weight: 700; }
.rs-tbl tr.ok .rs-m { color: #2f8f5b; }
.rs-tbl tr.bad .rs-m, .rs-tbl tr.bad .rs-y { color: #c23b86; }
.rs-tbl tr.bad { background: rgba(214, 77, 169, .05); }
.study .rs-tbl td.ko { font-size: 14.5px; line-height: 1.4; min-width: 110px; }
.study .rs-tbl td.rs-q { font-size: 16px; font-weight: 600; min-width: 140px; }
.rs-tbl .rs-q small { display: block; font-size: 12px; font-weight: 400; color: var(--muted); }
.rs-tbl .rs-n { min-width: 220px; font-size: 12px; color: var(--muted); }
.rs-none { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
.rs-more { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; }
html[data-theme='dark'] .rs-s { background: rgba(37, 39, 78, .6); border-color: var(--line); }
html[data-theme='dark'] .rs-tbl td { border-color: var(--line); }
</style>
