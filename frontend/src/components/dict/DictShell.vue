<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PinkShell from '@/components/site/PinkShell.vue'
import { DICT_SOURCE } from '@/data/korean/dictSource'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
/** side: слева закреплена панель (слот side), содержимое сдвигается; sideOpen: на телефоне панель открыта поверх */
defineProps<{ side?: boolean; sideOpen?: boolean; lock?: boolean }>()
</script>

<template>
  <PinkShell sub="большой словарь" width="100%">
    <template #nav>
      <slot name="top">
        <RouterLink to="/dict/podborki">Подборки</RouterLink>
        <RouterLink to="/dict/a">Все слова</RouterLink>
      </slot>
      <RouterLink v-if="progress.unlocked" to="/korean/words" class="mine">Мои слова</RouterLink>
    </template>
    <div class="dict-wrap" :class="{ 'has-side': side, locked: lock }">
      <aside v-if="side" class="dict-side" :class="{ open: sideOpen }"><slot name="side" /></aside>
      <main class="body"><slot /></main>
    </div>
    <footer class="src">
      <span>Данные: {{ DICT_SOURCE.title }}, {{ DICT_SOURCE.author }}.</span>
      <span>Архив: {{ DICT_SOURCE.archive }}. Снимок {{ DICT_SOURCE.snapshot }} года, новых слов в нём может не быть.</span>
      <span>Лицензия: <a :href="DICT_SOURCE.licenseUrl" target="_blank" rel="noopener noreferrer">{{ DICT_SOURCE.license }}</a>. Переводы и определения не изменены.</span>
    </footer>
  </PinkShell>
</template>

<style scoped>
.dict-wrap {
  /* переменные, которыми пользуются страницы словаря */
  --ink: #1e2350; --muted: #6b70a8; --line: rgba(120, 110, 200, .2); --accent: #b83a92; --accent2: #4a4f86;
  --soft: rgba(255, 255, 255, .6); --pink: rgba(214, 77, 169, .12); --surface: rgba(255, 255, 255, .72); --shadow: none;
  flex: 1; display: flex; gap: 24px; align-items: flex-start; width: 100%; padding-top: 12px; color: var(--ink); }
.dict-side { position: sticky; top: 96px; flex: none; width: 300px; height: calc(100vh - 150px); }
.body { flex: 1; min-width: 0; margin: 0 auto; display: flex; flex-direction: column; align-self: stretch; }
@media (max-width: 959px) {
  .dict-side { display: none; position: fixed; inset: 0; z-index: 60; width: auto; height: auto; padding: 12px; background: rgba(251, 248, 255, .85); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  .dict-side.open { display: block; }
}
.src { display: flex; flex-direction: column; gap: 2px; width: 100%; margin: 36px auto 0; padding-top: 18px; border-top: 1px solid var(--pk-line); font: 400 12px/1.6 var(--pk-mono); color: var(--pk-label); }
.src a { text-decoration: underline; text-underline-offset: 2px; }
</style>
