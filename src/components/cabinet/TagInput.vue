<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_TAGS, MAX_TAG_LEN, cleanTag } from '@/lib/tags'

const props = defineProps<{ modelValue: string[]; suggestions: string[]; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [tags: string[]] }>()

const draft = ref('')
const focused = ref(false)
const cleaned = computed(() => cleanTag(draft.value))
/** Подсказки: уже существующие теги, которые подходят под набранное и ещё не выбраны. */
const hints = computed(() => props.suggestions.filter(t => !props.modelValue.includes(t) && t.includes(cleaned.value)).slice(0, 8))
const full = computed(() => props.modelValue.length >= MAX_TAGS)

function add(raw: string) {
  const t = cleanTag(raw)
  if (t && !full.value && !props.modelValue.includes(t)) emit('update:modelValue', [...props.modelValue, t])
  draft.value = ''
}
const remove = (t: string) => emit('update:modelValue', props.modelValue.filter(x => x !== t))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    add(draft.value)
  } else if (e.key === 'Backspace' && !draft.value && props.modelValue.length) remove(props.modelValue.at(-1)!)
}
</script>

<template>
  <div class="tg-in">
    <div class="tg-box">
      <span v-for="t in modelValue" :key="t" class="tg-chip">#{{ t }}<button type="button" :aria-label="`Убрать тег ${t}`" @click="remove(t)">✕</button></span>
      <input
        v-model="draft"
        :maxlength="MAX_TAG_LEN + 1"
        :disabled="full"
        :placeholder="modelValue.length ? '' : label || 'Теги: напишите и нажмите Enter'"
        aria-label="Добавить тег"
        @keydown="onKey"
        @focus="focused = true"
        @blur="focused = false; add(draft)"
      />
    </div>
    <div v-if="focused && (hints.length || (cleaned && !suggestions.includes(cleaned)))" class="tg-hints">
      <button v-for="t in hints" :key="t" type="button" @mousedown.prevent="add(t)">#{{ t }}</button>
      <button v-if="cleaned && !suggestions.includes(cleaned) && !modelValue.includes(cleaned)" type="button" class="new" @mousedown.prevent="add(cleaned)">＋ создать #{{ cleaned }}</button>
    </div>
  </div>
</template>

<style>
.study .tg-in { position: relative; }
.study .tg-box { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg, #fff); border: 1px solid var(--line); border-radius: 10px; }
.study .tg-box input { flex: 1; min-width: 140px; padding: 4px 0; font: inherit; font-size: 14px; background: transparent; border: 0; outline: 0; }
.study .tg-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; font-size: 13px; font-weight: 600; color: var(--gold); background: var(--gold-soft); border-radius: 99px; }
.study .tg-chip button { width: 18px; height: 18px; padding: 0; font-size: 10px; color: inherit; background: transparent; border: 0; border-radius: 50%; cursor: pointer; }
.study .tg-chip button:hover { background: rgba(0, 0, 0, .08); }
.study .tg-hints { position: absolute; z-index: 5; left: 0; right: 0; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; padding: 8px; background: var(--surface, #fff); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 24px -12px rgba(0, 0, 0, .25); }
.study .tg-hints button { padding: 4px 10px; font: inherit; font-size: 13px; color: var(--gold); background: var(--gold-soft); border: 0; border-radius: 99px; cursor: pointer; }
.study .tg-hints .new { color: #fff; background: var(--gold); }
.study .tg-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; padding: 0; list-style: none; }
.study .tg-tag { padding: 2px 9px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--gold); background: var(--gold-soft); border: 0; border-radius: 99px; cursor: pointer; }
.study .tg-tag.on, .study .tg-tag:hover { color: #fff; background: var(--gold); }
.study .tg-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; }
</style>
