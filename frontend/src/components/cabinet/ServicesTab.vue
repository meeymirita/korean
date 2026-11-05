<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { errText, fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'
import type { OpsLogsReply, OpsServiceState, OpsServicesReply } from '@/types/ops'
import { searchDocuments } from '@/data/korean/search'
import type { SearchServiceStatus } from '@/types/search'

const progress = useProgressStore()
const state = ref<OpsServicesReply | null>(null)
const logs = ref<OpsLogsReply | null>(null)
const selected = ref('backend')
const error = ref('')
const logError = ref('')
const loading = ref(false)
const refreshing = ref(false)
const indexing = ref(false)
const searchMessage = ref('')
const searchState = ref<SearchServiceStatus | null>(null)
const privateIndexing = ref(false)
const privateIndexMessage = ref('')
let timer: ReturnType<typeof setInterval> | undefined

const headers = () => ({ Authorization: `Bearer ${progress.bearer}` })

async function loadServices() {
  if (loading.value) return
  loading.value = true
  try {
    const response = await fetchT('/api/ops/services', { headers: headers() })
    if (!response.ok) throw new Error(response.status === 403 ? 'Состояние сервисов доступно только владельцу.' : `Сервер ответил кодом ${response.status}.`)
    state.value = await response.json() as OpsServicesReply
    error.value = ''
    if (!state.value.services.some(service => service.name === selected.value)) selected.value = state.value.services[0]?.name || ''
  } catch (cause) {
    error.value = errText(cause)
  } finally {
    loading.value = false
  }
}

async function loadLogs() {
  if (!selected.value) return
  try {
    const response = await fetchT(`/api/ops/logs/${encodeURIComponent(selected.value)}?tail=200`, { headers: headers() })
    if (!response.ok) throw new Error(response.status === 403 ? 'Журналы доступны только владельцу.' : `Сервер ответил кодом ${response.status}.`)
    logs.value = await response.json() as OpsLogsReply
    logError.value = ''
  } catch (cause) {
    logs.value = null
    logError.value = errText(cause)
  }
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  await loadServices()
  await loadLogs()
  await loadSearchStatus()
  refreshing.value = false
}

async function loadSearchStatus() {
  try {
    const response = await fetchT('/api/search/status', { headers: headers() })
    if (!response.ok) throw new Error(`Состояние Meilisearch недоступно: HTTP ${response.status}.`)
    searchState.value = await response.json() as SearchServiceStatus
  } catch (cause) {
    searchState.value = null
    searchMessage.value = errText(cause)
  }
}

async function rebuildSearchIndex() {
  if (indexing.value) return
  indexing.value = true
  searchMessage.value = ''
  try {
    const response = await fetchT('/api/search/reindex', {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(searchDocuments()),
    }, 120_000)
    const reply = await response.json().catch(() => ({})) as { documents?: number; error?: string; detail?: string }
    if (!response.ok) throw new Error([reply.error || `Сервер ответил кодом ${response.status}.`, reply.detail].filter(Boolean).join(': '))
    searchMessage.value = `Индекс обновлён: ${reply.documents || 0} документов.`
    await loadSearchStatus()
  } catch (cause) {
    searchMessage.value = errText(cause)
  } finally {
    indexing.value = false
  }
}

async function rebuildPrivateSearchIndex() {
  if (privateIndexing.value) return
  privateIndexing.value = true
  privateIndexMessage.value = ''
  try {
    const response = await fetchT('/api/search/private/reindex', { method: 'POST', headers: headers() }, 120_000)
    const reply = await response.json().catch(() => ({})) as { documents?: number; error?: string }
    if (!response.ok) throw new Error(reply.error || `Сервер ответил кодом ${response.status}.`)
    privateIndexMessage.value = `Закрытый индекс обновлён: ${reply.documents || 0} документов.`
  } catch (cause) {
    privateIndexMessage.value = errText(cause)
  } finally {
    privateIndexing.value = false
  }
}

function serviceName(name: string) {
  return ({ backend: 'Сервер', frontend: 'Сайт', 'caddy-host': 'Caddy на сервере', caddy: 'Caddy в Docker (edge)', prometheus: 'Prometheus', grafana: 'Grafana', 'node-exporter': 'node-exporter', 'docker-proxy': 'Docker proxy', postgres: 'PostgreSQL', redis: 'Redis', meilisearch: 'Meilisearch' } as Record<string, string>)[name] || name
}

function healthName(service: OpsServiceState) {
  if (service.state !== 'running') return 'Не запущен'
  return ({ healthy: 'Работает', starting: 'Запускается', unhealthy: 'Ошибка healthcheck', not_configured: 'Healthcheck не задан', unknown: 'Состояние неизвестно' } as Record<string, string>)[service.health] || service.health
}

const time = (value?: string) => value ? new Date(value).toLocaleString('ru-RU') : '—'

onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), 15_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section class="ops-tab">
    <div class="ops-head">
      <div>
        <h2>Сервисы и контейнеры</h2>
        <p class="muted">Статусы и последние журналы текущего Docker Compose проекта.</p>
      </div>
      <button type="button" class="chip" :disabled="refreshing" @click="refresh">{{ refreshing ? 'Обновляю…' : 'Обновить' }}</button>
    </div>

    <p v-if="error" class="ops-error" role="alert">{{ error }}</p>
    <p v-else-if="!state && loading" class="muted">Загружаю состояния…</p>

    <div v-if="state" class="ops-meta muted">
      Проект: <b>{{ state.project }}</b> · проверено {{ time(state.checkedAt) }}
    </div>
    <div class="ops-search-index">
      <div>
        <b>Поисковый индекс Meilisearch</b>
        <p class="muted">Индекс содержит только открытые учебные материалы. При изменении каталога его можно пересобрать здесь.</p>
        <p class="muted" role="status">
          <template v-if="searchState?.indexed && searchState.available">Готов · {{ searchState.documents }} документов</template>
          <template v-else-if="searchState?.available">Сервис работает, индекс ещё не создан</template>
          <template v-else-if="searchState">{{ searchState.message || 'Сервис не настроен или недоступен' }}</template>
          <template v-else>Проверка состояния пока не выполнена</template>
        </p>
        <p v-if="searchMessage" class="muted" role="status">{{ searchMessage }}</p>
      </div>
      <button type="button" class="chip" :disabled="indexing" @click="rebuildSearchIndex">{{ indexing ? 'Индексирую…' : 'Пересобрать индекс' }}</button>
      <div class="ops-private-index">
        <span class="muted">Закрытый поиск заметок и галереи восстанавливается из PostgreSQL. Данные доступны только через API владельца.</span>
        <button type="button" class="chip" :disabled="privateIndexing" @click="rebuildPrivateSearchIndex">{{ privateIndexing ? 'Индексирую…' : 'Обновить личный индекс' }}</button>
        <span v-if="privateIndexMessage" class="muted" role="status">{{ privateIndexMessage }}</span>
      </div>
    </div>
    <div v-if="state" class="ops-grid">
      <button
        v-for="service in state.services"
        :key="service.name"
        type="button"
        class="ops-service"
        :class="{ selected: selected === service.name, down: service.state !== 'running' || service.health === 'unhealthy' }"
        @click="if (!service.external) { selected = service.name; loadLogs() }"
      >
        <span class="ops-service-top"><b>{{ serviceName(service.name) }}</b><i :class="service.state === 'running' && service.health !== 'unhealthy' ? 'up' : 'down'" /></span>
        <span>{{ healthName(service) }}</span>
        <small>{{ service.container || service.status }}</small>
      </button>
    </div>

    <div class="ops-logs-head">
      <h3>Журнал приложения</h3>
      <label>
        <span class="sr-only">Выбрать сервис</span>
        <select v-model="selected" @change="loadLogs">
          <option v-for="service in (state?.services || []).filter(item => !item.external)" :key="service.name" :value="service.name">{{ serviceName(service.name) }}</option>
        </select>
      </label>
    </div>
    <p v-if="logError" class="ops-error" role="alert">{{ logError }}</p>
    <pre v-else class="ops-log" aria-live="polite">{{ logs?.logs || 'Журнал пуст.' }}</pre>
  </section>
</template>

<style scoped>
.ops-tab { display: grid; gap: 1rem; }
.ops-head, .ops-service-top, .ops-logs-head { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
.ops-head h2, .ops-logs-head h3 { margin: 0; }
.ops-head p { margin: .35rem 0 0; }
.ops-meta { font-size: .9rem; }
.ops-search-index { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--line, #ddd); border-radius: 12px; }
.ops-search-index p { margin: .35rem 0 0; }
.ops-private-index { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; margin-top: .7rem; }
.ops-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .7rem; }
.ops-service { display: grid; gap: .35rem; text-align: left; border: 1px solid var(--line, #ddd); border-radius: 12px; padding: .8rem; background: var(--card, #fff); color: inherit; cursor: pointer; }
.ops-service.selected { outline: 2px solid var(--accent, #508b72); }
.ops-service.down { border-color: #c66; }
.ops-service small { overflow-wrap: anywhere; color: var(--muted, #777); }
.ops-service-top i { width: .65rem; height: .65rem; border-radius: 50%; background: #5a8; }
.ops-service-top i.down { background: #c55; }
.ops-log { overflow: auto; max-height: 32rem; min-height: 9rem; margin: 0; padding: 1rem; border-radius: 10px; background: #161a19; color: #d8e5df; font: .8rem/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.ops-error { color: #a22; }
select { max-width: 100%; appearance: none; padding: 9px 38px 9px 16px; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink, #2b2d5b); border: 1px solid var(--line, #ddd); border-radius: 999px; cursor: pointer;
  background: var(--card, #fff) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5l5-5' fill='none' stroke='%238f7cf0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 14px center; transition: border-color .15s, box-shadow .15s; }
select:hover { border-color: var(--gold, #8f7cf0); }
select:focus-visible { outline: none; border-color: var(--gold, #8f7cf0); box-shadow: 0 0 0 3px rgba(139, 124, 240, .22); }
@media (max-width: 600px) { .ops-head, .ops-logs-head, .ops-search-index { align-items: flex-start; flex-wrap: wrap; } }
</style>
