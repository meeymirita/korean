<script setup lang="ts">
import { computed } from 'vue'
import { isMarkableWord, MAX_K_MARKS } from '@/lib/marks'
import { useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/**
 * Звёздочка «в избранное» у слова большого словаря: метка `k:<слово>` в `settings.marks` (без новой таблицы и API).
 * Страница `/dict` открыта всем и рисуется на сервере: там и до входа кнопки нет (`unlocked` станет true после оживления,
 * как вход и прогресс, `plugins/app.client.ts`); у гостя звёздочки тоже нет, его записи не сохраняются.
 */
const props = defineProps<{ word: string; small?: boolean }>()
const progress = useProgressStore()
const toast = useToastStore()
const owner = computed(() => progress.unlocked && !progress.isGuest && isMarkableWord(props.word))
const on = computed(() => progress.isMarked('k', props.word))
function toggle() {
  if (!progress.toggleMark('k', props.word)) toast.error(`В избранном словаря уже ${MAX_K_MARKS} слов: сними ненужные на странице «Важное»`)
}
</script>

<template>
  <button v-if="owner" type="button" class="dict-star" :class="{ on, sm: small }" :aria-pressed="on" :title="on ? 'Убрать из избранного' : 'В избранное'" :aria-label="on ? 'Убрать из избранного' : 'Добавить в избранное'" @click.stop="toggle">{{ on ? '★' : '☆' }}</button>
</template>

<style scoped>
.dict-star { margin-left: auto; padding: 2px 10px; font: inherit; font-size: 28px; line-height: 1; color: #5f649f; background: transparent; border: 0; border-radius: 10px; cursor: pointer; }
.dict-star.sm { margin-left: 0; font-size: 20px; padding: 0 6px; }
.dict-star:hover, .dict-star.on { color: #e0a028; }
</style>
