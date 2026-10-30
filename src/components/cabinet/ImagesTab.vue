<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TagInput from '@/components/cabinet/TagInput.vue'
import { useAllTags } from '@/composables/useAllTags'
import { useToastStore } from '@/stores/toast'
import { askConfirm } from '@/composables/useConfirm'
import { ALLOWED, MAX_CAPTION, MAX_DESCRIPTION, formatSize, useImagesStore, type ImageItem } from '@/stores/images'

const store = useImagesStore()
const toast = useToastStore()
const allTags = useAllTags()
const uploadTags = ref<string[]>([])
const tagFilter = ref('')
const imageTags = computed(() => [...store.tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([t]) => t))
const errors = ref<string[]>([])
const status = ref('')
const busy = ref(false)
const dragging = ref(false)
const failed = ref(false)

/** Адреса миниатюр: подставляются по мере загрузки. */
const thumbs = ref<Record<string, string>>({})
async function showThumb(it: ImageItem) {
  if (thumbs.value[it.id]) return
  try {
    thumbs.value[it.id] = await store.blobUrl(it.id, 'thumb')
  } catch {
    /* миниатюра не загрузилась: останется заглушка */
  }
}
watch(() => store.items, items => items.forEach(showThumb), { deep: true, immediate: true })

onMounted(async () => {
  try {
    await store.load()
  } catch (e) {
    failed.value = true
    errors.value = [(e as Error).message]
  }
})
onBeforeUnmount(() => store.release())

/** Загрузка по очереди: сначала проверка на сайте, потом отправка; ошибки по каждому файлу отдельно. */
async function upload(list: FileList | File[] | null) {
  const files = [...(list ?? [])]
  if (!files.length || busy.value) return
  busy.value = true
  errors.value = []
  let done = 0
  for (const f of files) {
    status.value = `Загружаю ${done + 1} из ${files.length}: ${f.name}`
    const problem = store.check(f)
    if (problem) {
      errors.value.push(problem)
      continue
    }
    try {
      await store.upload(f, '', 'gallery', uploadTags.value)
      done++
    } catch (e) {
      errors.value.push(`${f.name}: ${(e as Error).message}`)
    }
  }
  status.value = done ? `Загружено: ${done}` : ''
  if (done) toast.ok(done === 1 ? 'Картинка загружена' : `Загружено картинок: ${done}`)
  if (errors.value.length) toast.error(errors.value[0]!)
  busy.value = false
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  void upload(input.files)
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void upload(e.dataTransfer?.files ?? null)
}

/* ---------- поиск и фильтр по дате ---------- */
const query = ref('')
const from = ref('')
const to = ref('')
const startOf = (d: string) => new Date(d + 'T00:00:00').getTime()
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const a = from.value ? startOf(from.value) : -Infinity
  const b = to.value ? startOf(to.value) + 86_400_000 : Infinity
  return store.items.filter(it => it.created >= a && it.created < b && (!tagFilter.value || it.tags.includes(tagFilter.value)) && (!q || `${it.caption} ${it.description} ${it.name} ${it.tags.join(' ')}`.toLowerCase().includes(q)))
})
const filtering = computed(() => !!(query.value.trim() || from.value || to.value || tagFilter.value))
function resetFilter() {
  query.value = from.value = to.value = tagFilter.value = ''
}

const usedPct = computed(() => Math.min(100, (store.used / store.limit) * 100))
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/* ---------- просмотр ---------- */
const openId = ref<string | null>(null)
const current = computed(() => store.items.find(i => i.id === openId.value) ?? null)
const full = ref('')
const caption = ref('')
const description = ref('')
const saved = ref(false)
const tags = ref<string[]>([])

async function show(id: string | null) {
  openId.value = id
  full.value = ''
  saved.value = false
  const it = store.items.find(i => i.id === id)
  caption.value = it?.caption ?? ''
  description.value = it?.description ?? ''
  tags.value = [...(it?.tags ?? [])]
  if (!it) return
  try {
    const url = await store.blobUrl(it.id, 'file')
    if (openId.value === it.id) full.value = url
  } catch {
    errors.value = ['Не получилось открыть картинку.']
  }
}
function step(d: number) {
  const i = filtered.value.findIndex(x => x.id === openId.value)
  const next = filtered.value[i + d]
  if (next) void show(next.id)
}
async function saveInfo() {
  if (!current.value) return
  try {
    await store.update(current.value.id, { caption: caption.value, description: description.value, tags: tags.value })
    saved.value = true
    toast.ok('Сохранено')
  } catch (e) {
    errors.value = [(e as Error).message]
  }
}
async function remove(it: ImageItem) {
  const yes = await askConfirm({ title: `Удалить картинку «${it.caption || it.name}»?`, text: 'Это нельзя отменить.', ok: 'Удалить', danger: true })
  if (!yes) return
  try {
    await store.remove(it.id)
    delete thumbs.value[it.id]
    toast.ok('Картинка удалена')
    if (openId.value === it.id) openId.value = null
  } catch (e) {
    errors.value = [(e as Error).message]
  }
}
function onKey(e: KeyboardEvent) {
  if (!openId.value) return
  if (e.key === 'Escape') openId.value = null
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key === 'ArrowRight') step(1)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="cb-body im">
    <label class="im-drop" :class="{ on: dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
      <input type="file" multiple :accept="ALLOWED.join(',')" :disabled="busy" @change="onPick" />
      <b>{{ busy ? status : 'Перетащите картинки сюда или нажмите, чтобы выбрать' }}</b>
      <small>JPEG, PNG, GIF, WebP · до {{ formatSize(store.maxFile) }} каждая</small>
    </label>

    <TagInput v-model="uploadTags" :suggestions="allTags" label="Теги для новых картинок (необязательно)" />

    <div class="im-usage">
      <div class="im-bar"><i :style="{ width: usedPct + '%' }"></i></div>
      <span>{{ formatSize(store.used) }} из {{ formatSize(store.limit) }} · {{ store.items.length }} шт.</span>
      <span v-if="!busy && status" class="im-ok">{{ status }}</span>
    </div>
    <ul v-if="errors.length" class="im-err">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <div v-if="store.items.length" class="im-filter">
      <input v-model="query" class="im-q" placeholder="Поиск по названию и описанию" aria-label="Поиск по картинкам" />
      <label>с <input v-model="from" type="date" :max="to || undefined" aria-label="Дата от" /></label>
      <label>по <input v-model="to" type="date" :min="from || undefined" aria-label="Дата до" /></label>
      <button v-if="filtering" type="button" class="plain" @click="resetFilter">Сбросить</button>
      <span class="im-found">{{ filtering ? `Найдено: ${filtered.length} из ${store.items.length}` : '' }}</span>
    </div>

    <div v-if="imageTags.length" class="tg-filter">
      <button v-for="t in imageTags" :key="t" type="button" class="tg-tag" :class="{ on: tagFilter === t }" @click="tagFilter = tagFilter === t ? '' : t">#{{ t }}</button>
    </div>

    <p v-if="store.loaded && !store.items.length" class="cb-empty">Картинок пока нет. Загрузите первую.</p>
    <p v-else-if="store.items.length && !filtered.length" class="cb-empty">Ничего не найдено.</p>
    <p v-else-if="failed" class="cb-empty">Не получилось загрузить список картинок.</p>

    <ul class="im-grid">
      <li v-for="it in filtered" :key="it.id" class="im-card">
        <button class="im-thumb" :aria-label="`Открыть ${it.caption || it.name}`" @click="show(it.id)">
          <img v-if="thumbs[it.id]" :src="thumbs[it.id]" :alt="it.caption || it.name" loading="lazy" />
          <span v-else class="im-wait">…</span>
        </button>
        <div class="im-meta">
          <b>{{ it.caption || it.name }}</b>
          <small v-if="it.description" class="im-desc">{{ it.description }}</small>
          <small v-if="it.tags.length" class="im-tags">{{ it.tags.map(t => '#' + t).join(' ') }}</small>
          <small>{{ when(it.created) }} · {{ formatSize(it.size) }}</small>
        </div>
      </li>
    </ul>

    <div v-if="current" class="im-view" @click.self="openId = null">
      <div class="im-box" role="dialog" aria-modal="true" :aria-label="current.caption || current.name">
        <button class="im-x" aria-label="Закрыть" @click="openId = null">✕</button>
        <button class="im-nav prev" aria-label="Предыдущая" :disabled="filtered[0]?.id === current.id" @click="step(-1)">←</button>
        <button class="im-nav next" aria-label="Следующая" :disabled="filtered.at(-1)?.id === current.id" @click="step(1)">→</button>
        <div class="im-stage">
          <img v-if="full" :src="full" :alt="current.caption || current.name" />
          <span v-else class="im-wait">Загружаю…</span>
        </div>
        <form class="im-info" @submit.prevent="saveInfo">
          <input v-model="caption" :maxlength="MAX_CAPTION" placeholder="Название" aria-label="Название" @input="saved = false" />
          <textarea v-model="description" :maxlength="MAX_DESCRIPTION" rows="2" placeholder="Описание" aria-label="Описание" @input="saved = false"></textarea>
          <TagInput v-model="tags" :suggestions="allTags" @update:model-value="saved = false" />
          <button type="submit">{{ saved ? '✓ Сохранено' : 'Сохранить' }}</button>
          <a v-if="full" :href="full" :download="current.name" class="im-dl">Скачать</a>
          <button type="button" class="plain danger" @click="remove(current)">Удалить</button>
        </form>
        <small class="im-file">{{ current.name }} · {{ current.width }}×{{ current.height }} · {{ formatSize(current.size) }} · {{ when(current.created) }}</small>
      </div>
    </div>
  </div>
</template>
