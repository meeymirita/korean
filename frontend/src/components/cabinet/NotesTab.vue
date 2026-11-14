<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dragDrop } from '@/lib/dragdrop'
import { errText } from '@/lib/http'
import NoteGlyph from '@/components/cabinet/NoteGlyph.vue'
import NoteImages from '@/components/cabinet/NoteImages.vue'
import TrashPanel from '@/components/cabinet/TrashPanel.vue'
import NoteModal from '@/components/cabinet/NoteModal.vue'
import TagInput from '@/components/cabinet/TagInput.vue'
import { useAllTags } from '@/composables/useAllTags'
import { MAX_NOTE_IMAGES, MAX_NOTES, MAX_TEXT, MAX_TITLE, PREVIEW, useNotesStore, type Note } from '@/stores/notes'
import { askConfirm, askTokenDo } from '@/composables/useConfirm'
import { formatRemind } from '@/lib/notesMeta'
import { useToastStore } from '@/stores/toast'
import { useImagesStore } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'
import { searchPrivateRemote } from '@/data/korean/search'

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
const remoteNoteIds = ref<string[] | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchRequest = 0
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
  if (!q) return byTag
  // совпадение по подстроке главное, индекс добавляет найденное с опечатками
  const remote = new Set(remoteNoteIds.value ?? [])
  return byTag.filter(n => (n.title + ' ' + n.text + ' ' + n.tags.join(' ')).toLowerCase().includes(q) || remote.has(n.id))
})

watch(query, value => {
  clearTimeout(searchTimer)
  remoteNoteIds.value = null
  const request = ++searchRequest
  if (!value.trim()) return
  searchTimer = setTimeout(async () => {
    const reply = await searchPrivateRemote(value, 'note', progress.bearer)
    if (request === searchRequest && reply) remoteNoteIds.value = reply.hits.map(hit => hit.id.slice('note:'.length))
  }, 180)
})
/** Порядок заметок меняется перетаскиванием за значок ⠿ (только когда виден весь список: без поиска, тега и правки). */
const list = ref<HTMLElement>()
const canSort = computed(() => !query.value.trim() && !tagFilter.value && editing.value === null && shown.value.length > 1)
let stopDrag = () => {}
function setupDrag() {
  stopDrag()
  stopDrag = () => {}
  const el = list.value
  if (!canSort.value || !el) return
  stopDrag = dragDrop({
    tiles: el.querySelectorAll('.nt-card'),
    targets: () => el.querySelectorAll('.nt-card'),
    handle: '.nt-grip',
    overClass: 'nt-over',
    dragClass: 'nt-dragging',
    resetOnDrop: false,
    onEnd: () => (lastDragEnd = Date.now()),
    onDrop: (tile, target) => void drop(el, tile, target),
  })
}
/** Отпускание кнопки после перетаскивания не должно открывать карточку (браузер присылает «клик» на карточке, под которой отпустили). */
let lastDragEnd = 0
const justDragged = () => Date.now() - lastDragEnd < 400
const openCard = (n: Note) => { if (editing.value !== n.id && !justDragged()) openedId.value = n.id }

/** Заметку бросили на место другой: остальные плавно сдвигаются, а брошенная плавно садится на своё место (приём FLIP на gsap). */
async function drop(el: HTMLElement, tile: HTMLElement, target: HTMLElement) {
  const from = tile.dataset.id
  const to = target.dataset.id
  if (!from || !to) return
  const cards = Array.from(el.querySelectorAll('.nt-card'))
  let state: unknown = null
  let Flip: typeof import('gsap/Flip').Flip | null = null
  try {
    const [{ gsap }, mod] = await Promise.all([import('gsap'), import('gsap/Flip')])
    Flip = mod.Flip
    gsap.registerPlugin(Flip)
    state = Flip.getState(cards)
    gsap.set(tile, { x: 0, y: 0, clearProps: 'transform' })
  } catch {
    tile.style.transform = ''
  }
  if (!store.move(from, to)) {
    // та же группа или нечего менять: карточка возвращается на место
    if (Flip && state) Flip.from(state as never, { duration: 0.3, ease: 'power2.out' })
    return
  }
  await nextTick()
  if (Flip && state) Flip.from(state as never, { duration: 0.35, ease: 'power2.inOut' })
}
watch([shown, canSort], () => void nextTick(setupDrag), { flush: 'post' })
onMounted(() => void nextTick(setupDrag))
onBeforeUnmount(() => { clearTimeout(searchTimer); searchRequest++; stopDrag() })

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
        imgError.value = `${f.name}: ${errText(err)}`
        toast.error(imgError.value)
      }
    }
  } catch (err) {
    imgError.value = errText(err)
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
  // у владельца удаление мягкое: заметка 30 дней лежит в корзине; у гостя заметки только в памяти и стираются сразу
  const yes = await askConfirm(store.owner
    ? { title: `Убрать заметку «${n.title}» в корзину?`, text: 'Она будет лежать в корзине 30 дней, её можно вернуть.', ok: 'В корзину', danger: true }
    : { title: `Удалить заметку «${n.title}»?`, text: 'Это нельзя отменить.', ok: 'Удалить', danger: true })
  if (yes) {
    store.remove(n.id)
    toast.ok(store.owner ? 'Заметка в корзине' : 'Заметка удалена')
    openedId.value = null
    if (showTrash.value) void openTrash()
  }
}

function pin(n: Note) {
  if (store.togglePin(n.id)) toast.ok(n.pinned ? 'Заметка закреплена' : 'Заметка откреплена')
}
function setRemind(n: Note, value: string | null) {
  if (store.update(n.id, { remindAt: value })) toast.ok(value ? 'Напоминание поставлено' : 'Напоминание убрано')
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
    toast.ok('Заметка возвращена')
  } catch (e) {
    toast.error(errText(e))
  }
}
async function purge(id: string) {
  const n = store.trash.find(x => x.id === id)
  const done = await askTokenDo(
    { title: `Удалить заметку «${n?.title ?? ''}» навсегда?`, text: 'Вернуть её будет нельзя. Введите свой токен, чтобы подтвердить.', ok: 'Удалить навсегда' },
    token => store.purge(id, token),
  )
  if (done) toast.ok('Заметка удалена навсегда')
}

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="cb-body nt">
    <form class="nt-form" @submit.prevent="add">
      <h3>＋ Новая заметка</h3>
      <label class="nt-field">Название заметки
        <input v-model="title" :maxlength="MAX_TITLE" :class="{ at: title.length >= MAX_TITLE }" placeholder="Например, Частицы места" aria-label="Название заметки" />
        <small class="cb-count" :class="{ at: title.length >= MAX_TITLE }">{{ title.length }} / {{ MAX_TITLE }}</small>
      </label>
      <label class="nt-field">Текст
      <textarea
        v-model="text"
        :maxlength="MAX_TEXT"
        :class="{ at: text.length >= MAX_TEXT }"
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
        <span class="nt-count cb-count" :class="{ at: text.length >= MAX_TEXT }">{{ text.length }} / {{ MAX_TEXT }}</span>
        <label v-if="canImages" class="nt-add"><template v-if="uploading">Загружаю…</template><template v-else><Icon name="picture" /> Картинки</template><input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploading" @change="attach($event, 'new')" /></label>
        <button type="submit" :disabled="(!title.trim() && !text.trim() && !pending.length) || store.full">Добавить заметку</button>
      </div>
      <p v-if="store.full" class="nt-warn">Достигнут лимит: {{ MAX_NOTES }} заметок. Удалите ненужные, чтобы добавить новые.</p>
    </form>

    <div class="nt-top">
      <input v-if="store.notes.length > 3" v-model="query" class="nt-search" placeholder="Поиск по заметкам" aria-label="Поиск по заметкам" />
      <span class="nt-status" :class="store.status">{{ statusText }}</span>
      <span class="nt-total">{{ store.notes.length }} / {{ MAX_NOTES }}</span>
    </div>

    <div v-if="store.owner" class="nt-bin">
      <button type="button" :class="{ on: showTrash }" :aria-expanded="showTrash" @click="toggleTrash">Корзина{{ store.trashLoaded ? ` (${store.trash.length})` : '' }}</button>
    </div>
    <TrashPanel v-if="store.owner && showTrash" noun="Заметки" :items="store.trash.map(n => ({ id: n.id, title: n.title, sub: n.text.slice(0, 80), deletedAt: n.deletedAt }))" :loading="trashLoading" :error="trashError" @restore="restore" @purge="purge" />

    <div v-if="noteTags.length" class="tg-filter">
      <button v-for="t in noteTags" :key="t" type="button" class="tg-tag" :class="{ on: tagFilter === t }" @click="toggleTag(t)">#{{ t }}</button>
    </div>

    <p v-if="!store.notes.length" class="cb-empty">Заметок пока нет. Напишите первую выше: название и несколько слов.</p>
    <p v-else-if="!shown.length" class="cb-empty">Ничего не найдено. Попробуйте другое слово или уберите тег из поиска.</p>

    <ul ref="list" class="nt-list">
      <li v-for="n in shown" :key="n.id" class="nt-card" :data-id="n.id" :class="{ click: editing !== n.id, pinned: n.pinned }" :tabindex="editing !== n.id ? 0 : undefined" @click="openCard(n)" @keydown.enter.self="openCard(n)">
        <template v-if="editing === n.id">
          <input v-model="editTitle" :maxlength="MAX_TITLE" :class="{ at: editTitle.length >= MAX_TITLE }" aria-label="Название" />
          <textarea v-model="editText" :maxlength="MAX_TEXT" :class="{ at: editText.length >= MAX_TEXT }" rows="5" aria-label="Описание"></textarea>
          <small class="cb-count" :class="{ at: editText.length >= MAX_TEXT }">{{ editText.length }} / {{ MAX_TEXT }}</small>
          <TagInput v-model="editTags" :suggestions="allTags" />
          <NoteImages :ids="editImages" removable @remove="id => (editImages = editImages.filter(x => x !== id))" />
          <p v-if="imgError" class="nt-err">{{ imgError }}</p>
          <div class="nt-acts">
            <label v-if="canImages" class="nt-add"><template v-if="uploading">Загружаю…</template><template v-else><Icon name="picture" /> Картинки</template><input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" :disabled="uploading" @change="attach($event, 'edit')" /></label>
            <button @click="saveEdit">Сохранить</button>
            <button class="plain" @click="editing = null">Отмена</button>
          </div>
        </template>
        <template v-else>
          <div class="nt-head">
            <h4><button v-if="canSort" type="button" class="nt-grip" aria-label="Перетащить заметку" title="Потяни, чтобы поменять порядок" @click.stop>⠿</button>{{ n.title }}<span v-if="n.pinned" class="nt-flags" title="Закреплена"><NoteGlyph name="pin" /></span></h4>
            <time>{{ when(n.created) }}<span v-if="n.updated - n.created > 60_000"> · изм. {{ when(n.updated) }}</span></time>
          </div>
          <p v-if="n.text" class="nt-text">{{ preview(n) }}</p>
          <p v-if="n.remindAt" class="nt-remind"><NoteGlyph name="clock" /> Напомнить {{ formatRemind(n.remindAt) }}</p>
          <ul v-if="n.tags.length" class="tg-tags"><li v-for="t in n.tags" :key="t"><button type="button" class="tg-tag" :class="{ on: tagFilter === t }" @click.stop="toggleTag(t)">#{{ t }}</button></li></ul>
          <NoteImages v-if="canImages" :ids="n.images" />
          <div class="nt-acts">
            <button v-if="store.owner" class="plain" @click.stop="pin(n)"><NoteGlyph name="pin" /> {{ n.pinned ? 'Открепить' : 'Закрепить' }}</button>
            <button class="plain" @click.stop="startEdit(n)">Изменить</button>
            <button class="plain danger" @click.stop="remove(n)">Удалить</button>
          </div>
        </template>
      </li>
    </ul>
    <NoteModal v-if="opened" :note="opened" :images="canImages" :owner="store.owner" @close="openedId = null" @edit="startEdit(opened)" @remove="remove(opened)" @pin="pin(opened)" @remind="v => setRemind(opened!, v)" />
  </div>
</template>
