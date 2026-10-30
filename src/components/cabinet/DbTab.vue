<script setup lang="ts">
import { fetchT } from '@/lib/http'
import { computed, onMounted, ref, watch } from 'vue'
import { formatCell, rangeText } from '@/data/dbView'
import { useProgressStore } from '@/stores/progress'

interface Table {
  name: string
  rows: number
}
interface Rows {
  table: string
  columns: { name: string; type: string }[]
  rows: Record<string, unknown>[]
  total: number
  limit: number
  offset: number
}

const progress = useProgressStore()
const LIMIT = 50
/** Что лежит в таблице: подсказки по названиям. */
const HINTS: Record<string, string> = {
  answers: 'каждый ответ отдельной строкой',
  words: 'статистика по каждому слову',
  days: 'сколько ответов по дням',
  meta: 'очки, профиль, настройки',
  notes: 'заметки',
  images: 'описание картинок (файлы лежат на диске)',
  guests: 'гостевые токены (хэши скрыты)',
  events: 'журнал: входы, токены, картинки',
}

const tables = ref<Table[]>([])
const current = ref('')
const data = ref<Rows | null>(null)
const query = ref('')
const offset = ref(0)
const error = ref('')
const loading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const headers = () => ({ Authorization: `Bearer ${progress.bearer}` })

async function api<T>(url: string): Promise<T> {
  const res = await fetchT(url, { headers: headers() })
  if (!res.ok) throw new Error(res.status === 403 ? 'просмотр базы доступен только владельцу' : `ошибка сервера ${res.status}`)
  return res.json()
}

async function loadTables() {
  try {
    tables.value = await api<Table[]>('/api/db/tables')
    if (!current.value && tables.value.length) current.value = (tables.value.find(t => t.name === 'answers') ?? tables.value[0]!).name
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function loadRows() {
  if (!current.value) return
  loading.value = true
  error.value = ''
  try {
    const q = new URLSearchParams({ limit: String(LIMIT), offset: String(offset.value), q: query.value })
    data.value = await api<Rows>(`/api/db/tables/${current.value}?${q}`)
  } catch (e) {
    error.value = (e as Error).message
  }
  loading.value = false
}

function pick(name: string) {
  current.value = name
  query.value = ''
  offset.value = 0
}

watch(current, () => void loadRows())
watch(query, () => {
  offset.value = 0
  clearTimeout(timer)
  timer = setTimeout(() => void loadRows(), 300)
})
watch(offset, () => void loadRows())

const shown = computed(() => data.value?.rows.length ?? 0)
const hasPrev = computed(() => offset.value > 0)
const hasNext = computed(() => !!data.value && offset.value + LIMIT < data.value.total)

onMounted(loadTables)
</script>

<template>
  <div class="cb-body db">
    <p class="db-note">Здесь видно, что лежит в базе. Только просмотр: изменить данные отсюда нельзя.</p>

    <div class="db-tabs">
      <button v-for="t in tables" :key="t.name" class="chip" :class="{ on: current === t.name }" :title="HINTS[t.name]" @click="pick(t.name)">
        {{ t.name }} <small>{{ t.rows }}</small>
      </button>
      <button class="chip plain" title="Обновить" @click="loadTables(); loadRows()">↻</button>
    </div>
    <p v-if="current && HINTS[current]" class="db-hint">{{ HINTS[current] }}</p>

    <div class="db-bar">
      <input v-model="query" class="db-search" placeholder="Поиск по всем колонкам" aria-label="Поиск по таблице" />
      <span class="db-range">{{ data ? rangeText(offset, shown, data.total) : '' }}</span>
      <button :disabled="!hasPrev" @click="offset = Math.max(0, offset - LIMIT)">← Назад</button>
      <button :disabled="!hasNext" @click="offset += LIMIT">Дальше →</button>
    </div>

    <p v-if="error" class="db-err">{{ error }}</p>

    <div v-if="data" class="db-wrap" :class="{ loading }">
      <table class="db-table">
        <thead>
          <tr>
            <th v-for="c in data.columns" :key="c.name">{{ c.name }}<small>{{ c.type.toLowerCase() }}</small></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in data.rows" :key="i">
            <td v-for="c in data.columns" :key="c.name" :class="{ muted: formatCell(c.name, row[c.name]).muted }" :title="formatCell(c.name, row[c.name]).title">
              {{ formatCell(c.name, row[c.name]).text }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!data.rows.length" class="cb-empty">{{ query ? 'Ничего не найдено.' : 'В таблице пока пусто.' }}</p>
    </div>
  </div>
</template>
