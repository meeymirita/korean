<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MAX_NOTES, MAX_TEXT, MAX_TITLE, useNotesStore, type Note } from '@/stores/notes'

const store = useNotesStore()
const title = ref('')
const text = ref('')
const query = ref('')
const editing = ref<string | null>(null)
const editTitle = ref('')
const editText = ref('')

onMounted(() => void store.init())

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? store.notes.filter(n => (n.title + ' ' + n.text).toLowerCase().includes(q)) : store.notes
})

const statusText = computed(
  () =>
    ({
      local: store.message,
      saving: 'сохраняю…',
      saved: '✓ ' + store.message,
      error: '⚠ ' + store.message,
    })[store.status],
)

function add() {
  if (store.add(title.value, text.value)) {
    title.value = ''
    text.value = ''
  }
}

function startEdit(n: Note) {
  editing.value = n.id
  editTitle.value = n.title
  editText.value = n.text
}
function saveEdit() {
  if (editing.value) store.update(editing.value, { title: editTitle.value, text: editText.value })
  editing.value = null
}
function remove(n: Note) {
  if (confirm(`Удалить заметку «${n.title}»? Это нельзя отменить.`)) store.remove(n.id)
}

const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="cb-body nt">
    <form class="nt-form" @submit.prevent="add">
      <input v-model="title" :maxlength="MAX_TITLE" placeholder="Название" aria-label="Название заметки" />
      <textarea
        v-model="text"
        :maxlength="MAX_TEXT"
        rows="4"
        placeholder="Описание. Ctrl + Enter — добавить"
        aria-label="Описание заметки"
        @keydown.ctrl.enter.prevent="add"
        @keydown.meta.enter.prevent="add"
      ></textarea>
      <div class="nt-bar">
        <span class="nt-count">{{ text.length }} / {{ MAX_TEXT }}</span>
        <button type="submit" :disabled="(!title.trim() && !text.trim()) || store.full">Добавить заметку</button>
      </div>
      <p v-if="store.full" class="nt-warn">Достигнут лимит: {{ MAX_NOTES }} заметок. Удалите ненужные, чтобы добавить новые.</p>
    </form>

    <div class="nt-top">
      <input v-if="store.notes.length > 3" v-model="query" class="nt-search" placeholder="Поиск по заметкам" aria-label="Поиск по заметкам" />
      <span class="nt-status" :class="store.status">{{ statusText }}</span>
      <span class="nt-total">{{ store.notes.length }} / {{ MAX_NOTES }}</span>
    </div>

    <p v-if="!store.notes.length" class="cb-empty">Заметок пока нет. Напишите первую выше: название и несколько слов.</p>
    <p v-else-if="!shown.length" class="cb-empty">Ничего не найдено.</p>

    <ul class="nt-list">
      <li v-for="n in shown" :key="n.id" class="nt-card">
        <template v-if="editing === n.id">
          <input v-model="editTitle" :maxlength="MAX_TITLE" aria-label="Название" />
          <textarea v-model="editText" :maxlength="MAX_TEXT" rows="5" aria-label="Описание"></textarea>
          <div class="nt-acts">
            <button @click="saveEdit">Сохранить</button>
            <button class="plain" @click="editing = null">Отмена</button>
          </div>
        </template>
        <template v-else>
          <div class="nt-head">
            <h4>{{ n.title }}</h4>
            <time>{{ when(n.created) }}<span v-if="n.updated - n.created > 60_000"> · изм. {{ when(n.updated) }}</span></time>
          </div>
          <p v-if="n.text" class="nt-text">{{ n.text }}</p>
          <div class="nt-acts">
            <button class="plain" @click="startEdit(n)">Изменить</button>
            <button class="plain danger" @click="remove(n)">Удалить</button>
          </div>
        </template>
      </li>
    </ul>
  </div>
</template>
