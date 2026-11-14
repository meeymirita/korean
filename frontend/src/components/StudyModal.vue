<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Общая оболочка окна учебного раздела: затемнение, коробка с кнопкой ✕, закрытие по Esc и по клику мимо.
 * `name` даёт окну свои классы `<name>` и `<name>-box` (на них держатся стили содержимого), `width` задаёт ширину коробки.
 */
defineProps<{ name: string; label: string; width?: string }>()
const emit = defineEmits<{ close: [] }>()
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="sm" :class="name" @click.self="emit('close')">
      <article class="sm-box study sky" :class="`${name}-box`" role="dialog" aria-modal="true" :aria-label="label" :style="width ? { '--sm-w': width } : undefined">
        <button class="sm-x" type="button" aria-label="Закрыть" @click="emit('close')">✕</button>
        <slot />
      </article>
    </div>
  </Teleport>
</template>

<style>
.sm { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 18px; overflow-y: auto; background: rgba(32, 38, 92, .45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.sm .sm-box.study { position: relative; min-height: 0; width: min(var(--sm-w, 520px), 100%); max-height: calc(100vh - 36px); overflow-y: auto; padding: 24px 26px 22px;
  background: linear-gradient(160deg, #fff 0%, #fdf3fb 55%, #eef4ff 100%); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 30px 70px -20px rgba(80, 70, 160, .55); }
.sm-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(143, 124, 240, .12); color: var(--muted); font-size: 14px; cursor: pointer; transition: background .15s; }
.sm-x:hover { background: rgba(214, 77, 169, .18); color: var(--pink); }
</style>
