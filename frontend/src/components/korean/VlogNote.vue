<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Vlog } from '@/data/korean/vlogs'
import { cleanTag } from '@/lib/tags'
import { MAX_TEXT, useNotesStore } from '@/stores/notes'
import { useProgressStore } from '@/stores/progress'

/**
 * «Моя заметка» к влогу: одно большое поле, текст сохраняется сам. Это обычная заметка (Кабинет → Заметки) с тегами `влог` и `v-<номер видео>`:
 * по второму тегу находим заметку этого влога. Заметок у гостя нет (он ничего не сохраняет), поэтому блок только у владельца.
 */
const props = defineProps<{ vlog: Vlog }>()
const progress = useProgressStore()
const notes = useNotesStore()
const owner = computed(() => !progress.isGuest && !!progress.bearer)
const tag = computed(() => cleanTag(`v-${props.vlog.yt}`))
const found = computed(() => notes.notes.find(n => n.tags.includes(tag.value)))
const open = ref(false)
const text = ref('')
const state = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined
let ready = false

async function show() {
  open.value = !open.value
  if (!open.value || ready) return
  await notes.init()
  text.value = found.value?.text ?? ''
  ready = true
}

function save() {
  const v = props.vlog
  const t = text.value
  const n = found.value
  if (n) notes.update(n.id, { text: t })
  else if (t.trim()) {
    if (!notes.add(`Заметка к влогу: ${v.title}`, t, [], ['влог', tag.value])) {
      state.value = 'error'
      return
    }
  }
  state.value = 'saved'
}
watch(text, () => {
  if (!ready) return
  state.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(save, 700)
})
// другой влог на той же странице: поле читает свою заметку заново
watch(
  () => props.vlog.id,
  () => {
    clearTimeout(timer)
    ready = false
    open.value = false
    state.value = 'idle'
  },
)
onBeforeUnmount(() => {
  clearTimeout(timer)
  if (ready && state.value === 'saving') save()
})
const label = computed(() => ({ idle: '', saving: 'Сохраняю…', saved: 'Сохранено в заметки', error: 'Не сохранилось: в заметках нет места (лимит)' })[state.value])
</script>

<template>
  <section v-if="owner" class="vn" aria-label="Моя заметка к влогу">
    <button type="button" class="vn-btn" :class="{ has: !!found?.text }" :aria-expanded="open" @click="show">
      <span aria-hidden="true">✎</span> Моя заметка<small v-if="found?.text && !open">: есть запись</small>
    </button>
    <div v-if="open" class="vn-body">
      <textarea v-model="text" class="vn-area" rows="9" :maxlength="MAX_TEXT" aria-label="Заметка к влогу" placeholder="Что запомнить из этого влога: слова и фразы, что непонятно, что спросить у Леры…"></textarea>
      <p class="vn-foot"><span :class="state">{{ label }}</span><span>{{ text.length }} / {{ MAX_TEXT }}</span></p>
    </div>
  </section>
</template>

<style scoped>
.vn { margin-top: 12px; }
.vn-btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); padding: 7px 16px; font: inherit; font-size: 14px; cursor: pointer; }
.vn-btn.has { border-color: var(--accent); }
.vn-btn small { color: var(--muted); }
.vn-body { margin-top: 10px; }
.vn-area { display: block; width: 100%; box-sizing: border-box; min-height: 220px; resize: vertical; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); font: inherit; font-size: 16px; line-height: 1.6; }
.vn-area:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.vn-foot { display: flex; justify-content: space-between; gap: 12px; margin: 6px 4px 0; color: var(--muted); font-size: 13px; }
.vn-foot .saved { color: var(--ok); }
.vn-foot .error { color: #d6455d; }
</style>
