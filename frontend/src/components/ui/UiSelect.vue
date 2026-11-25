<script setup lang="ts">
/**
 * Выпадающий список в общем оформлении: капсула, своя стрелка с отступом, фокус-кольцо.
 * Варианты кладутся в слот как обычные `<option>`; `v-model` и `v-model.number` работают, остальные атрибуты и события (`id`, `aria-label`, `@change`) идут на сам `<select>`.
 * `size`: `md` для основных полей (44 px), `sm` для строк настроек и фильтров (34 px).
 */
const props = withDefaults(defineProps<{ modelValue?: string | number; size?: 'md' | 'sm'; modelModifiers?: { number?: boolean } }>(), { size: 'md' })
const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
function onChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', props.modelModifiers?.number ? Number(v) : v)
}
</script>

<template>
  <select class="ui-select" :class="`ui-select--${size}`" :value="modelValue" @change="onChange"><slot /></select>
</template>

<style scoped>
.ui-select { appearance: none; -webkit-appearance: none; box-sizing: border-box; max-width: 100%; border: 1.5px solid var(--ui-line); background: var(--ui-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%237C5CFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat; color: var(--ui-ink); font: inherit; font-weight: 600; text-overflow: ellipsis; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.ui-select--md { min-width: 280px; height: var(--ui-h); padding: 0 44px 0 18px; border-radius: 999px; font-size: 15px; background-position: right 18px center; }
.ui-select--sm { height: var(--ui-h-sm); padding: 0 34px 0 14px; border-radius: 999px; font-size: 14px; background-position: right 13px center; }
.ui-select:hover { border-color: var(--ui-accent); }
.ui-select:focus-visible { outline: none; border-color: var(--ui-accent); box-shadow: 0 0 0 3px rgba(124, 92, 255, .2); }
.ui-select:disabled { opacity: .55; cursor: default; }
</style>
