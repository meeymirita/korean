<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { buildAskAi, canAskAi, type AskOpts } from '@/lib/askAi'
import '@/assets/breakdown.css'

/**
 * Кнопка «Спросить ИИ» с панелью чата под ней (только владелец после входа; на сервере и у гостя ничего не рисуется).
 * `context` это то, что видно на экране (предложение, слово, правило, ошибка): уходит модели вместе с вопросом, строкой или функцией.
 */
const props = defineProps<{ context: string | (() => string); quick?: string[]; placeholder?: string; mode?: 'vlog'; label?: string; /** открыть панель сразу, без кнопки */ open?: boolean }>()
const host = ref<HTMLElement | null>(null)
onMounted(() => {
  const el = host.value
  if (!el || !canAskAi()) return
  const opts: AskOpts = { quick: props.quick, placeholder: props.placeholder, mode: props.mode, label: props.label }
  const btn = buildAskAi(() => (typeof props.context === 'function' ? props.context() : props.context), p => el.append(p), undefined, opts)
  el.append(btn)
  if (props.open) {
    btn.hidden = true
    btn.click()
  }
})
</script>

<template>
  <div ref="host" class="ask-host" />
</template>
