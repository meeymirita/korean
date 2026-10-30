<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import '@/assets/home/fonts.css'
import { openSearch } from '@/composables/useSearchWindow'
import SearchWindow from '@/components/SearchWindow.vue'

const route = useRoute()
const LINKS = [
  { to: '/korean/home', ko: '홈', text: 'Главная раздела' },
  { to: '/korean/words', ko: '단어', text: 'Слова' },
  { to: '/korean/grammar', ko: '문법', text: 'Грамматика' },
  { to: '/korean/ref', ko: '참고', text: 'Справочник' },
]
</script>

<template>
  <main class="nf">
    <div class="mark ko">✳</div>
    <h1 class="ko">404</h1>
    <p class="lead">Такой страницы нет</p>
    <p class="path">{{ route.fullPath }}</p>
    <p class="hint">Возможно, адрес набран с ошибкой или страница переехала. Попробуй поиск или перейди в раздел.</p>
    <div class="row">
      <button class="btn main" type="button" @click="openSearch">Найти по платформе</button>
      <RouterLink to="/" class="btn">На главную</RouterLink>
    </div>
    <nav class="links">
      <RouterLink v-for="l in LINKS" :key="l.to" :to="l.to"><span class="ko">{{ l.ko }}</span>{{ l.text }}</RouterLink>
    </nav>
    <SearchWindow />
  </main>
</template>

<style scoped>
.nf { --ink: #1e2350; --soft: #8b8fc4; --accent: #d64da9; --accent2: #6a5cd0;
  position: fixed; inset: 0; overflow: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 32px 20px; text-align: center;
  color: var(--ink); font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all;
  background: radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%), radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%), #fbf8ff; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }
.mark { font-size: 44px; color: var(--accent); line-height: 1; }
h1 { margin: 0; font-size: clamp(64px, 16vw, 120px); font-weight: 700; letter-spacing: 6px; line-height: 1;
  background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lead { margin: 6px 0 0; font-size: 20px; font-weight: 600; }
.path { margin: 0; max-width: 90vw; overflow-wrap: anywhere; font-size: 12px; color: var(--soft); }
.hint { margin: 10px 0 18px; max-width: 420px; font-size: 14px; color: var(--soft); line-height: 1.5; }
.row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.btn { padding: 11px 20px; border: 1px solid var(--ink); border-radius: 22px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: .2s; }
.btn:hover { background: var(--ink); color: #fff; }
.btn.main { background: var(--ink); color: #fff; }
.btn.main:hover { background: var(--accent2); border-color: var(--accent2); }
.links { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 26px; }
.links a { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 96px; padding: 12px 14px; border: 1px solid rgba(120, 110, 200, .18); border-radius: 14px;
  background: rgba(255, 255, 255, .6); color: var(--ink); text-decoration: none; font-size: 12px; transition: .2s; }
.links a .ko { font-size: 18px; color: var(--accent2); }
.links a:hover { transform: translateY(-2px); border-color: var(--accent2); }
</style>
