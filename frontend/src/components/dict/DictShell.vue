<script setup lang="ts">
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import bg from '@/assets/dict/bg.webp'
import { DICT_SOURCE } from '@/data/korean/dictSource'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
</script>

<template>
  <div class="dict-root" :style="{ backgroundImage: `url(${bg})` }">
  <div class="dict-scroll">
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
  </div>
</template>

<style scoped>
.dict-root { position: fixed; inset: 0; background: #d9cdf5 center / cover no-repeat; }
.dict-root::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(251, 248, 255, .35), rgba(251, 248, 255, .12) 40%, rgba(251, 248, 255, .3)); }
.dict-scroll { --ink: #1e2350; --muted: #5f649f; --line: rgba(120, 110, 200, .2); --accent: #d64da9; --accent2: #6a5cd0; --soft: #f1ecff; --pink: #ffe3f3;
  --surface: rgba(255, 255, 255, .86); --shadow: 0 18px 45px rgba(70, 55, 140, .18);
  position: absolute; inset: 0; z-index: 1; overflow-y: scroll; overflow-x: hidden; display: flex; flex-direction: column; padding: clamp(20px, 3vh, 36px) clamp(16px, 4vw, 64px) 18px;
  color: var(--ink); font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; }
.dict-scroll > * { position: relative; width: 100%; max-width: 1040px; margin-left: auto; margin-right: auto; }
.dict-scroll a { color: inherit; text-decoration: none; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }
.top { display: flex; align-items: center; gap: 20px; padding: 12px 20px; border: 1px solid rgba(255, 255, 255, .7); border-radius: 999px; background: rgba(255, 255, 255, .62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.brand { display: flex; align-items: baseline; gap: 12px; flex: none; }
.brand .mark { font-size: 26px; color: var(--accent2); line-height: 1; }
.brand .name { font-size: 18px; letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--muted); text-transform: uppercase; }
.nav { margin-left: auto; font-size: 12.5px; color: var(--muted); flex: none; }
.mine { display: inline-flex; align-items: center; gap: 6px; }
.nav a:hover { color: var(--ink); }
.body { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.src { display: flex; flex-direction: column; gap: 2px; margin-top: 36px; align-self: flex-end; width: fit-content; max-width: min(100%, 560px); margin-left: 0; margin-right: calc(-1 * clamp(16px, 4vw, 64px) + 16px); padding: 10px 16px; border-radius: 16px; background: rgba(255, 255, 255, .7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font-size: 11.5px; line-height: 1.45; color: var(--muted); text-align: left; }
.src a { text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 600px) { .brand .sub { display: none; } .top { flex-wrap: wrap; border-radius: 22px; } }
</style>
