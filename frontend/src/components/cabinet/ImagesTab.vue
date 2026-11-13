<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { errText } from '@/lib/http'
import TagInput from '@/components/cabinet/TagInput.vue'
import TrashPanel from '@/components/cabinet/TrashPanel.vue'
import { useAllTags } from '@/composables/useAllTags'
import { useToastStore } from '@/stores/toast'
import { askConfirm, askTokenDo } from '@/composables/useConfirm'
import { ALLOWED, MAX_CAPTION, MAX_DESCRIPTION, formatSize, useImagesStore, type ImageItem } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'
import { searchPrivateRemote } from '@/data/korean/search'

const store = useImagesStore()
const progress = useProgressStore()
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
    errors.value = [errText(e)]
  }
})
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
      errors.value.push(`${f.name}: ${errText(e)}`)
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
const remoteImageIds = ref<string[] | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRequest = 0
const from = ref('')
const to = ref('')
const startOf = (d: string) => new Date(d + 'T00:00:00').getTime()
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const a = from.value ? startOf(from.value) : -Infinity
  const b = to.value ? startOf(to.value) + 86_400_000 : Infinity
  // совпадение по подстроке главное, индекс добавляет найденное с опечатками
  const remote = new Set(q ? remoteImageIds.value ?? [] : [])
  return store.items.filter(it => it.created >= a && it.created < b && (!tagFilter.value || it.tags.includes(tagFilter.value)) && (!q || remote.has(it.id) || `${it.caption} ${it.description} ${it.name} ${it.tags.join(' ')}`.toLowerCase().includes(q)))
})
const filtering = computed(() => !!(query.value.trim() || from.value || to.value || tagFilter.value))
function resetFilter() {
  query.value = from.value = to.value = tagFilter.value = ''
}

watch(query, value => {
  clearTimeout(searchTimer)
  remoteImageIds.value = null
  const request = ++searchRequest
  if (!value.trim()) return
  searchTimer = setTimeout(async () => {
    const reply = await searchPrivateRemote(value, 'image', progress.bearer)
    if (request === searchRequest && reply) remoteImageIds.value = reply.hits.map(hit => hit.id.slice('image:'.length))
  }, 180)
})
onBeforeUnmount(() => { store.release(); clearTimeout(searchTimer); searchRequest++ })

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
    errors.value = [errText(e)]
  }
}
async function remove(it: ImageItem) {
  const yes = await askConfirm({ title: `Убрать картинку «${it.caption || it.name}» в корзину?`, text: 'Она будет лежать в корзине 30 дней, её можно вернуть. Файл на Диске не удаляется.', ok: 'В корзину', danger: true })
  if (!yes) return
  try {
    await store.remove(it.id)
    toast.ok('Картинка в корзине')
    if (openId.value === it.id) openId.value = null
    if (showTrash.value) void openTrash()
  } catch (e) {
    errors.value = [errText(e)]
  }
}

/* ---------- корзина ---------- */
const showTrash = ref(false)
const trashLoading = ref(false)
const trashError = ref('')
async function openTrash() {
  trashLoading.value = true
  trashError.value = ''
  try {
    await store.loadTrash()
    store.trash.forEach(showThumb)
  } catch (e) {
    trashError.value = errText(e)
  } finally {
    trashLoading.value = false
  }
}
function toggleTrash() {
  showTrash.value = !showTrash.value
  if (showTrash.value) void openTrash()
}
async function restore(id: string) {
  try {
    await store.restore(id)
    toast.ok('Картинка возвращена')
  } catch (e) {
    toast.error(errText(e))
  }
}
async function purge(id: string) {
  const it = store.trash.find(i => i.id === id)
  const done = await askTokenDo(
    { title: `Удалить картинку «${it?.caption || it?.name || ''}» навсегда?`, text: 'Файл и копия на Диске будут стёрты, вернуть нельзя. Введите свой токен, чтобы подтвердить.', ok: 'Удалить навсегда' },
    token => store.purge(id, token),
  )
  if (done) {
    delete thumbs.value[id]
    toast.ok('Картинка удалена навсегда')
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

    <RouterLink to="/upload" class="im-bulk">Массовая загрузка: много картинок сразу, у каждой свои теги и описание →</RouterLink>

    <TagInput v-model="uploadTags" :suggestions="allTags" label="Теги для новых картинок (необязательно)" />

    <div class="im-usage">
      <span>{{ store.items.length }} шт. · занято {{ formatSize(store.used) }} (подробнее в «Настройках»)</span>
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

    <div class="nt-bin">
      <button type="button" :class="{ on: showTrash }" :aria-expanded="showTrash" @click="toggleTrash">Корзина{{ store.trashLoaded ? ` (${store.trash.length})` : '' }}</button>
    </div>
    <TrashPanel v-if="showTrash" noun="Картинки" :items="store.trash.map(i => ({ id: i.id, title: i.caption || i.name, sub: formatSize(i.size), deletedAt: i.deletedAt }))" :loading="trashLoading" :error="trashError" @restore="restore" @purge="purge">
      <template #thumb="{ item }"><img v-if="thumbs[item.id]" class="tr-thumb" :src="thumbs[item.id]" alt="" /><span v-else class="tr-thumb"></span></template>
    </TrashPanel>

    <p v-if="failed" class="cb-empty">Не получилось загрузить список картинок. Проверьте связь и обновите страницу.</p>
    <p v-else-if="store.loaded && !store.items.length" class="cb-empty">Картинок пока нет. Загрузите первую.</p>
    <p v-else-if="store.items.length && !filtered.length" class="cb-empty">Ничего не найдено. Попробуйте другое слово или уберите фильтр.</p>

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
          <input v-model="caption" :maxlength="MAX_CAPTION" :class="{ at: caption.length >= MAX_CAPTION }" placeholder="Название" aria-label="Название" @input="saved = false" />
          <small class="cb-count" :class="{ at: caption.length >= MAX_CAPTION }">{{ caption.length }} / {{ MAX_CAPTION }}</small>
          <textarea v-model="description" :maxlength="MAX_DESCRIPTION" :class="{ at: description.length >= MAX_DESCRIPTION }" rows="2" placeholder="Описание" aria-label="Описание" @input="saved = false"></textarea>
          <small class="cb-count" :class="{ at: description.length >= MAX_DESCRIPTION }">{{ description.length }} / {{ MAX_DESCRIPTION }}</small>
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
