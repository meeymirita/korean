<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePersisted } from '@/composables/usePersisted'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

interface Line {
  t: number
  level: 'info' | 'warn' | 'error'
  msg: string
}
interface Reply {
  configured: boolean
  reason?: string
  lines: Line[]
}

const progress = useProgressStore()
const source = usePersisted<'app' | 'caddy'>('logs_source', 'app', v => v === 'app' || v === 'caddy')
const level = usePersisted<'' | 'warn' | 'error'>('logs_level', '', v => v === '' || v === 'warn' || v === 'error')
const q = ref('')
const auto = ref(false)
const reply = ref<Reply | null>(null)
const failed = ref('')
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const params = new URLSearchParams({ limit: '300' })
    if (level.value) params.set('level', level.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const res = await fetchT(`/api/logs/${source.value}?${params}`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (!res.ok) throw new Error(res.status === 403 ? 'журналы видны только владельцу' : `ошибка сервера ${res.status}`)
    reply.value = (await res.json()) as Reply
    failed.value = ''
  } catch (e) {
    failed.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch([source, level], load)
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(typing)
  typing = setTimeout(load, 350)
})
watch(auto, on => {
  clearInterval(timer)
  if (on) timer = setInterval(load, 5000)
})
onMounted(load)
onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(typing)
})

/** Новые строки внизу, как в терминале; показываем с конца. */
const rows = computed(() => reply.value?.lines ?? [])
const time = (t: number) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const hint = computed(() => {
  const r = reply.value
  if (!r || r.configured) return ''
  return r.reason === 'missing' ? 'Файл журнала Caddy не найден по пути из CADDY_LOG_FILE.' : r.reason === 'denied' ? 'У службы сервера нет прав читать файл журнала Caddy.' : 'Журнал Caddy не подключён: в server/.env не задан CADDY_LOG_FILE.'
})
</script>

<template>
  <div class="cb-body lg">
    <div class="lg-bar">
      <span class="lg-seg" role="tablist">
        <button :class="{ on: source === 'app' }" @click="source = 'app'">Сервер (Node)</button>
        <button :class="{ on: source === 'caddy' }" @click="source = 'caddy'">Caddy</button>
      </span>
      <span class="lg-seg">
        <button :class="{ on: level === '' }" @click="level = ''">Все</button>
        <button :class="{ on: level === 'warn' }" @click="level = 'warn'">Предупреждения и ошибки</button>
        <button :class="{ on: level === 'error' }" @click="level = 'error'">Ошибки</button>
      </span>
      <input v-model="q" class="lg-q" placeholder="Поиск по журналу" aria-label="Поиск по журналу" />
      <button class="plain" :disabled="loading" @click="load">↻ Обновить</button>
      <label class="lg-auto"><input v-model="auto" type="checkbox" /> каждые 5 с</label>
    </div>

    <p v-if="failed" class="cb-empty">Не получилось загрузить журнал: {{ failed }}</p>
    <div v-else-if="hint" class="cb-empty">
      <p>{{ hint }}</p>
      <p class="lg-how">Как подключить: в блоке сайта в Caddyfile добавь <code>log { output file /var/log/caddy/korean.log; format json }</code>, дай службе <code>progress</code> право читать файл и впиши в server/.env строку <code>CADDY_LOG_FILE=/var/log/caddy/korean.log</code>. Подробности в docs/hosting.md.</p>
    </div>
    <p v-else-if="reply && !rows.length" class="cb-empty">Записей нет{{ q || level ? ' по такому фильтру' : '' }}.</p>

    <ol v-if="rows.length" class="lg-list" aria-label="Журнал">
      <li v-for="(l, i) in rows" :key="i" :class="l.level">
        <time>{{ time(l.t) }}</time>
        <span class="lg-lv">{{ l.level === 'error' ? 'ошибка' : l.level === 'warn' ? 'внимание' : 'инфо' }}</span>
        <span class="lg-msg">{{ l.msg }}</span>
      </li>
    </ol>
    <p v-if="rows.length" class="lg-note">Показаны последние {{ rows.length }} записей, новые внизу. {{ source === 'app' ? 'Журнал сервера хранится в памяти и очищается при перезапуске; полный журнал: journalctl -u progress.' : '' }}</p>
  </div>
</template>

<style>
.study .lg-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 16px; }
.study .lg-seg { display: inline-flex; padding: 3px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.study .lg-seg button { padding: 7px 14px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: transparent; border: 0; border-radius: 9px; cursor: pointer; }
.study .lg-seg button.on { color: #fff; background: var(--gold); }
.study .lg-q { flex: 1; min-width: 180px; max-width: 320px; padding: 9px 14px; font: inherit; font-size: 14px; background: var(--bg, #fff); border: 1px solid var(--line); border-radius: 10px; outline: none; }
.study .lg-bar .plain { padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .lg-auto { font-size: 13px; color: var(--muted); }
.study .lg-how { font-size: 13px; line-height: 1.6; }
.study .lg-how code { padding: 1px 6px; background: var(--gold-soft); border-radius: 6px; font-size: 12px; overflow-wrap: anywhere; }
.study .lg-list { margin: 14px 0 0; padding: 8px 0; max-height: 640px; overflow: auto; list-style: none; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; font-family: var(--mono); font-size: 12.5px; }
.study .lg-list li { display: grid; grid-template-columns: 118px 64px minmax(0, 1fr); gap: 10px; padding: 4px 14px; border-bottom: 1px solid var(--line-soft); }
.study .lg-list li:last-child { border-bottom: 0; }
.study .lg-list time { color: var(--muted); }
.study .lg-lv { font-weight: 700; color: var(--muted); }
.study .lg-list li.warn .lg-lv { color: #b27300; }
.study .lg-list li.error { background: rgba(180, 70, 52, .08); }
.study .lg-list li.error .lg-lv { color: #b44634; }
.study .lg-msg { overflow-wrap: anywhere; white-space: pre-wrap; }
.study .lg-note { margin: 8px 0 0; font-size: 12.5px; color: var(--muted); }
@media (max-width: 700px) { .study .lg-list li { grid-template-columns: 1fr; gap: 0; } }
</style>
