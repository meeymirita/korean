<script setup lang="ts">
import { computed } from 'vue'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Звёздочка-закладка у слова (`w`) или правила (`g`). Видна только владельцу: у гостя записи не сохраняются. */
const props = defineProps<{ kind: 'w' | 'g'; id: string }>()
const progress = useProgressStore()
const toast = useToastStore()
const owner = computed(() => progress.unlocked && !progress.isGuest)
const on = computed(() => progress.isMarked(props.kind, props.id))
function toggle() {
  if (!progress.toggleMark(props.kind, props.id)) toast.error('Закладок уже 500: сними ненужные на странице «Важное»')
}
</script>

<template>
  <button v-if="owner" type="button" class="mark-star" :class="{ on }" :aria-pressed="on" :title="on ? 'Убрать из важного' : 'В важное'" :aria-label="on ? 'Убрать из важного' : 'Добавить в важное'" @click.stop="toggle">{{ on ? '★' : '☆' }}</button>
</template>
