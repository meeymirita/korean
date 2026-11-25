<script setup lang="ts">
import { computed, useAttrs } from 'vue'

/**
 * Поле поиска в общем оформлении: капсула со значком ⌕ слева, `v-model` на строку.
 * `class` и `style` относятся к обёртке (ширина, отступы), остальное (`placeholder`, `aria-label`, `@keydown.esc`, `autocomplete`) идёт на сам `<input type="search">`.
 * `size`: `md` 44 px, `sm` 34 px.
 */
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ modelValue?: string; size?: 'md' | 'sm' }>(), { modelValue: '', size: 'md' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})
</script>

<template>
  <label class="ui-search" :class="[`ui-search--${size}`, attrs.class]" :style="attrs.style as never">
    <span class="ui-search-ic" aria-hidden="true">⌕</span>
    <input v-bind="inputAttrs" type="search" :value="modelValue" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
  </label>
</template>

<style scoped>
.ui-search { position: relative; display: block; min-width: 0; }
.ui-search-ic { position: absolute; left: 15px; top: 50%; transform: translateY(-52%); color: var(--ui-accent); font-size: 17px; pointer-events: none; }
.ui-search input { width: 100%; box-sizing: border-box; border: 1.5px solid var(--ui-line); border-radius: 999px; background: var(--ui-surface); color: var(--ui-ink); font: inherit; font-weight: 600; transition: border-color .15s, box-shadow .15s; }
.ui-search--md input { height: var(--ui-h); padding: 0 14px 0 38px; font-size: 15px; }
.ui-search--sm input { height: var(--ui-h-sm); padding: 0 12px 0 34px; font-size: 14px; }
.ui-search--sm .ui-search-ic { left: 12px; font-size: 15px; }
.ui-search input::placeholder { color: var(--ui-muted); font-weight: 500; }
.ui-search input:focus { outline: none; border-color: var(--ui-accent); box-shadow: 0 0 0 3px rgba(124, 92, 255, .15); }
</style>
