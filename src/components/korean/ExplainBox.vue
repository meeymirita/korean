<script setup lang="ts">
import { computed } from 'vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { explain } from '@/data/korean/explain'
import type { Task } from '@/data/korean/tasks'

/** Разбор неверного ответа: что выбрано, как верно, почему, кнопка «Открыть правило». */
const props = defineProps<{ task: Task; picked: string }>()
const { open } = useGrammarModal()
const e = computed(() => explain(props.task, props.picked))
</script>

<template>
  <div class="xb" role="note">
    <span class="xb-t">{{ e.text }}</span>
    <button v-if="e.gram" type="button" class="xb-b" @click="open(e.gram.id)">Открыть правило «{{ e.gram.title }}»</button>
  </div>
</template>
