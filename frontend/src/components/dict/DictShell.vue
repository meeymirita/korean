<script setup lang="ts">
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { DICT_SOURCE } from '@/data/korean/krdictMock'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
</script>

<template>
  <div class="ds">
    <header class="top">
      <RouterLink to="/" class="brand"><span class="mark">✳︎</span><span class="name ko">우리말</span><span class="sub">большой словарь</span></RouterLink>
      <slot name="top" />
      <nav v-if="progress.unlocked" class="nav">
        <RouterLink to="/korean/words" class="mine">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          Мои слова
        </RouterLink>
      </nav>
    </header>
    <main class="body"><slot /></main>
    <footer class="src">
      <span>Данные: {{ DICT_SOURCE.title }}, {{ DICT_SOURCE.author }}.</span>
      <span>Архив: {{ DICT_SOURCE.archive }}. Снимок {{ DICT_SOURCE.snapshot }} года, новых слов в нём может не быть.</span>
      <span>Лицензия: <a :href="DICT_SOURCE.licenseUrl" target="_blank" rel="noopener noreferrer">{{ DICT_SOURCE.license }}</a>. Переводы и определения не изменены.</span>
    </footer>
  </div>
</template>

<style scoped>
.ds { --ink: #1e2350; --muted: #8b8fc4; --line: rgba(120, 110, 200, .16); --accent: #d64da9; --accent2: #6a5cd0; --soft: #f1ecff; --pink: #ffe3f3;
  --surface: rgba(255, 255, 255, .82); --shadow: 0 18px 45px rgba(100, 87, 170, .12);
  position: fixed; inset: 0; overflow: auto; display: flex; flex-direction: column; padding: clamp(20px, 3vh, 36px) clamp(16px, 4vw, 64px) 18px;
  color: var(--ink); background: #fbf8ff; font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; }
.ds::before { content: ""; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%), radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%); }
.ds > * { position: relative; width: 100%; max-width: 1040px; margin-left: auto; margin-right: auto; }
.ds a { color: inherit; text-decoration: none; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }
.top { display: flex; align-items: center; gap: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; flex: none; }
.brand .mark { font-size: 26px; color: var(--accent2); line-height: 1; }
.brand .name { font-size: 18px; letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--muted); text-transform: uppercase; }
.nav { margin-left: auto; font-size: 12.5px; color: var(--muted); flex: none; }
.mine { display: inline-flex; align-items: center; gap: 6px; }
.nav a:hover { color: var(--ink); }
.body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.src { display: flex; flex-direction: column; gap: 2px; margin-top: 36px; font-size: 11.5px; line-height: 1.45; color: var(--muted); text-align: left; }
.src a { text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 600px) { .brand .sub { display: none; } .top { flex-wrap: wrap; } }
</style>
