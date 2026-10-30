<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import NoteImages from '@/components/cabinet/NoteImages.vue'
import NoteModal from '@/components/cabinet/NoteModal.vue'
import TagInput from '@/components/cabinet/TagInput.vue'
import { useAllTags } from '@/composables/useAllTags'
import { MAX_NOTE_IMAGES, MAX_NOTES, MAX_TEXT, MAX_TITLE, PREVIEW, useNotesStore, type Note } from '@/stores/notes'
import { askConfirm } from '@/composables/useConfirm'
import { useToastStore } from '@/stores/toast'
import { useImagesStore } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'

const store = useNotesStore()
const images = useImagesStore()
const progress = useProgressStore()
const toast = useToastStore()
/** Картинки лежат на сервере и доступны только владельцу. */
const canImages = computed(() => progress.unlocked && !progress.isGuest)
const allTags = useAllTags()
const newTags = ref<string[]>([])
const editTags = ref<string[]>([])
/** Выбранный тег-фильтр (без «#»). */
const tagFilter = ref('')
const pending = ref<string[]>([])
const editImages = ref<string[]>([])
const imgError = ref('')
const uploading = ref(false)
const title = ref('')
const text = ref('')
const query = ref('')
const editing = ref<string | null>(null)
const editTitle = ref('')
const editText = ref('')

onMounted(() => {
  void store.init()
  // картинки нужны только для подсказок тегов: ошибку не показываем
  if (canImages.value && !images.loaded) void images.load().catch(() => undefined)
})

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const byTag = tagFilter.value ? store.notes.filter(n => n.tags.includes(tagFilter.value)) : store.notes
  return q ? byTag.filter(n => (n.title + ' ' + n.text + ' ' + n.tags.join(' ')).toLowerCase().includes(q)) : byTag
})

const noteTags = computed(() => [...store.tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([t]) => t))
const toggleTag = (t: string) => (tagFilter.value = tagFilter.value === t ? '' : t)

const statusText = computed(
  () =>
    ({
      local: store.message,
      saving: 'сохраняю…',
      saved: '✓ ' + store.message,
      error: '⚠ ' + store.message,
    })[store.status],
)

/** Загружает выбранные картинки в раздел «Картинки» и подставляет их id в список заметки. */
async function attach(e: Event, target: 'new' | 'edit') {
  const list = target === 'new' ? pending : editImages
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || uploading.value) return
  imgError.value = ''
  uploading.value = true
  try {
    if (!images.loaded) await images.load()
    for (const f of files) {
      if (list.value.length >= MAX_NOTE_IMAGES) {
        imgError.value = `В заметке не больше ${MAX_NOTE_IMAGES} картинок.`
        break
      }
      const problem = images.check(f)
      if (problem) {
        imgError.value = problem
        continue
      }
      try {
        list.value = [...list.value, (await images.upload(f, '', 'note')).id]
        toast.ok('Картинка добавлена')
      } catch (err) {
        imgError.value = `${f.name}: ${(err as Error).message}`
        toast.error(imgError.value)
      }
    }
  } catch (err) {
    imgError.value = (err as Error).message
  } finally {
    uploading.value = false
  }
}

function add() {
  if (store.add(title.value, text.value, pending.value, newTags.value)) {
    toast.ok('Заметка добавлена')
    title.value = ''
    text.value = ''
    pending.value = []
    newTags.value = []
  }
}

/** Текст в карточке обрезан до PREVIEW символов; целиком заметка открывается в окне по клику. */
const preview = (n: Note) => (n.text.length > PREVIEW ? n.text.slice(0, PREVIEW).trimEnd() + '…' : n.text)
const openedId = ref<string | null>(null)
const opened = computed(() => store.notes.find(n => n.id === openedId.value) ?? null)

function startEdit(n: Note) {
  openedId.value = null
  editing.value = n.id
  editTitle.value = n.title
  editText.value = n.text
  editImages.value = [...n.images]
  editTags.value = [...n.tags]
  imgError.value = ''
}
function saveEdit() {
  if (editing.value && store.update(editing.value, { title: editTitle.value, text: editText.value, images: editImages.value, tags: editTags.value })) toast.ok('Заметка сохранена')
  editing.value = null
}
async function remove(n: Note) {
  const yes = await askConfirm({ title: `Удалить заметку «${n.title}»?`, text: 'Это нельзя отменить.', ok: 'Удалить', danger: true })
  if (yes) {
    store.remove(n.id)
    toast.ok('Заметка удалена')
    openedId.value = null
  }
}

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="cb-body nt">
    <form class="nt-form" @submit.prevent="add">
      <h3>＋ Новая заметка</h3>
      <label class="nt-field">Название заметки
        <input v-model="title" :maxlength="MAX_TITLE" placeholder="Например, Частицы места" aria-label="Название заметки" />
      </label>
      <label class="nt-field">Текст
      <textarea
        v-model="text"
        :maxlength="MAX_TEXT"
        rows="4"
        placeholder="은/는 — тема предложения… (Ctrl + Enter — добавить)"
        aria-label="Описание заметки"
        @keydown.ctrl.enter.prevent="add"
        @keydown.meta.enter.prevent="add"
      ></textarea>
      </label>
      <TagInput v-model="newTags" :suggestions="allTags" />
      <NoteImages :ids="pending" removable @remove="id => (pending = pending.filter(x => x !== id))" />
      <p v-if="imgError" class="nt-err">{{ imgError }}</p>
      <div class="nt-bar">
        <span class="nt-count">{{ text.length }} / {{ MAX_TEXT }}</span>
        <label v-if="canImages" class="nt-add">{{ uploading ? 'Загружаю…' : '📎 Картинки' }}<input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploading" @change="attach($event, 'new')" /></label>
        <button type="submit" :disabled="(!title.trim() && !text.trim() && !pending.length) || store.full">Добавить заметку</button>
      </div>
      <p v-if="store.full" class="nt-warn">Достигнут лимит: {{ MAX_NOTES }} заметок. Удалите ненужные, чтобы добавить новые.</p>
    </form>

    <div class="nt-top">
      <input v-if="store.notes.length > 3" v-model="query" class="nt-search" placeholder="Поиск по заметкам" aria-label="Поиск по заметкам" />
      <span class="nt-status" :class="store.status">{{ statusText }}</span>
      <span class="nt-total">{{ store.notes.length }} / {{ MAX_NOTES }}</span>
    </div>

    <div v-if="noteTags.length" class="tg-filter">
      <button v-for="t in noteTags" :key="t" type="button" class="tg-tag" :class="{ on: tagFilter === t }" @click="toggleTag(t)">#{{ t }}</button>
    </div>

    <p v-if="!store.notes.length" class="cb-empty">Заметок пока нет. Напишите первую выше: название и несколько слов.</p>
    <p v-else-if="!shown.length" class="cb-empty">Ничего не найдено.</p>

    <ul class="nt-list">
      <li v-for="n in shown" :key="n.id" class="nt-card" :class="{ click: editing !== n.id }" @click="editing !== n.id && (openedId = n.id)">
        <template v-if="editing === n.id">
          <input v-model="editTitle" :maxlength="MAX_TITLE" aria-label="Название" />
          <textarea v-model="editText" :maxlength="MAX_TEXT" rows="5" aria-label="Описание"></textarea>
          <TagInput v-model="editTags" :suggestions="allTags" />
          <NoteImages :ids="editImages" removable @remove="id => (editImages = editImages.filter(x => x !== id))" />
          <p v-if="imgError" class="nt-err">{{ imgError }}</p>
          <div class="nt-acts">
            <label v-if="canImages" class="nt-add">{{ uploading ? 'Загружаю…' : '📎 Картинки' }}<input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploading" @change="attach($event, 'edit')" /></label>
            <button @click="saveEdit">Сохранить</button>
            <button class="plain" @click="editing = null">Отмена</button>
          </div>
        </template>
        <template v-else>
          <div class="nt-head">
            <h4>{{ n.title }}</h4>
            <time>{{ when(n.created) }}<span v-if="n.updated - n.created > 60_000"> · изм. {{ when(n.updated) }}</span></time>
          </div>
          <p v-if="n.text" class="nt-text">{{ preview(n) }}</p>
          <ul v-if="n.tags.length" class="tg-tags"><li v-for="t in n.tags" :key="t"><button type="button" class="tg-tag" :class="{ on: tagFilter === t }" @click.stop="toggleTag(t)">#{{ t }}</button></li></ul>
          <NoteImages v-if="canImages" :ids="n.images" />
          <div class="nt-acts">
            <button class="plain" @click.stop="startEdit(n)">Изменить</button>
            <button class="plain danger" @click.stop="remove(n)">Удалить</button>
          </div>
        </template>
      </li>
    </ul>
    <NoteModal v-if="opened" :note="opened" :images="canImages" @close="openedId = null" @edit="startEdit(opened)" @remove="remove(opened)" />
  </div>
</template>
